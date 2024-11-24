// cdk/lambda/authentication/githubUtils.ts
import {
  CognitoIdentityProviderClient,
  AdminGetUserCommand,
  AdminUpdateUserAttributesCommand,
  AttributeType
} from "@aws-sdk/client-cognito-identity-provider";
import type { RestEndpointMethodTypes } from "@octokit/plugin-rest-endpoint-methods";
import type { Octokit as OctokitType } from '@octokit/rest';
import type { App as AppType } from '@octokit/app';
import {
  CognitoAttribute as ImportedCognitoAttribute
} from './authTypes';

// Precise type definitions using Octokit's types
type GitHubRepo = RestEndpointMethodTypes["repos"]["listForAuthenticatedUser"]["response"]["data"][0];
type GitHubTreeItem = RestEndpointMethodTypes["git"]["getTree"]["response"]["data"]["tree"][0];
type GitHubBlobContent = RestEndpointMethodTypes["git"]["getBlob"]["response"]["data"];

type InstallationResponse = {
  id: number;
  account: {
    login: string;
    id: number;
    node_id: string;
    avatar_url: string;
    gravatar_id: string | null;
    url: string;
    html_url: string;
    type: string;
    site_admin: boolean;
  } | null;
};

interface GitHubRepoTreeOptions {
  owner: string;
  repo: string;
  sha?: string;
  recursive?: boolean;
  path?: string;
}

interface GitHubRepoListOptions {
  sort?: 'created' | 'updated' | 'pushed' | 'full_name';
  direction?: 'asc' | 'desc';
  per_page?: number;
}

interface GitHubTokenRefreshError extends Error {
  code?: 'GITHUB_AUTH_REQUIRED' | 'GITHUB_TOKEN_REFRESH_FAILED' | 'GITHUB_APP_INSTALLATION_REQUIRED';
}

interface GitHubAuthResponse {
  token: string;
  type: string;
  tokenType?: string;
  expiresAt?: string;
}

interface GitHubAppInfo {
  html_url: string;
  name: string;
}

const cognito = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION });

async function getOctokitModule(): Promise<typeof OctokitType> {
  try {
    const { Octokit } = await import('@octokit/rest');
    return Octokit;
  } catch (error) {
    console.error('Error importing Octokit:', error);
    throw error;
  }
}

async function getAppModule(): Promise<typeof AppType> {
  try {
    const { App } = await import('@octokit/app');
    return App;
  } catch (error) {
    console.error('Error importing App:', error);
    throw error;
  }
}

function validateGitHubAppConfig() {
  console.log('Validating GitHub App configuration');

  const appId = process.env.GITHUB_APP_ID;
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY;

  console.log('GitHub App configuration:', {
    appId: appId ? `${appId}` : undefined,
    hasPrivateKey: !!privateKey
  });

  if (!appId || !privateKey) {
    const error = new Error('GitHub App configuration is missing') as GitHubTokenRefreshError;
    error.code = 'GITHUB_AUTH_REQUIRED';
    throw error;
  }

  // Convert appId to number and validate
  const numericAppId = Number(appId);
  if (isNaN(numericAppId)) {
    console.error('Invalid GitHub App ID:', {
      rawValue: appId,
      numericValue: numericAppId,
      isNaN: isNaN(numericAppId)
    });
    const error = new Error('GitHub App ID must be a number') as GitHubTokenRefreshError;
    error.code = 'GITHUB_AUTH_REQUIRED';
    throw error;
  }

  return {
    appId: numericAppId,
    privateKey
  };
}

export async function getValidGitHubToken(cognitoUserId: string): Promise<string> {
  console.log('githubUtils: Getting valid GitHub token for user:', cognitoUserId);

  // Validate GitHub App configuration
  const config = validateGitHubAppConfig();
  console.log('Using GitHub App config:', {
    appId: config.appId,
    hasPrivateKey: !!config.privateKey
  });

  const user = await cognito.send(new AdminGetUserCommand({
    UserPoolId: process.env.COGNITO_USER_POOL_ID,
    Username: cognitoUserId,
  }));

  const githubUsername = user.UserAttributes?.find((attr: AttributeType) => attr.Name === ImportedCognitoAttribute.GH_USERNAME)?.Value;
  const githubId = user.UserAttributes?.find((attr: AttributeType) => attr.Name === ImportedCognitoAttribute.GH_ID)?.Value;
  const accessToken = user.UserAttributes?.find((attr: AttributeType) => attr.Name === ImportedCognitoAttribute.GH_TOKEN)?.Value;
  const expiresAt = parseInt(user.UserAttributes?.find((attr: AttributeType) => attr.Name === ImportedCognitoAttribute.GH_TOKEN_EXPIRES)?.Value || '0', 10);

  console.log('Parsed token info:', {
    githubUsername,
    githubId,
    accessToken: accessToken?.substring(0, 10),
    expiresAt
  });

  if (!githubId || !githubUsername) {
    const error = new Error('GitHub user information is incomplete') as GitHubTokenRefreshError;
    error.code = 'GITHUB_AUTH_REQUIRED';
    throw error;
  }

  const now = Math.floor(Date.now() / 1000);
  console.log('Current time:', now);

  // Check if existing token is still valid
  if (accessToken && now < expiresAt) {
    console.log('Access token is still valid');
    return accessToken;
  }

  try {
    // Create GitHub App instance
    const App = await getAppModule();
    console.log('Creating GitHub App instance with appId:', config.appId);

    // Create the app instance
    const app = new App({
      appId: config.appId,
      privateKey: config.privateKey
    });

    // Find the installation for the specific user
    console.log('Finding GitHub App installation for user:', githubUsername);
    const { data: installations } = await app.octokit.request('GET /app/installations') as { data: InstallationResponse[] };
    console.log('Found installations:', installations.length);

    const userInstallation = installations.find(installation =>
      installation.account?.login?.toLowerCase() === githubUsername.toLowerCase()
    );

    if (!userInstallation?.id) {
      // Get the app's public page URL
      const { data: appInfo } = await app.octokit.request('GET /app') as { data: GitHubAppInfo };
      const installUrl = `${appInfo.html_url}/installations/new`;

      const error = new Error(`GitHub App "${appInfo.name}" installation required. Please install the app at: ${installUrl}`) as GitHubTokenRefreshError;
      error.code = 'GITHUB_APP_INSTALLATION_REQUIRED';
      throw error;
    }

    console.log('Found installation ID:', userInstallation.id);

    // Get an installation Octokit instance
    const octokit = await app.getInstallationOctokit(userInstallation.id);
    const auth = await octokit.auth() as GitHubAuthResponse;

    if (!auth.token) {
      throw new Error('Failed to get installation token');
    }

    const newToken = auth.token;
    const newExpiresAt = Math.floor(Date.now() / 1000) + 3600; // Token expires in 1 hour

    // Update Cognito with new token information
    await updateCognitoAttributes(
      cognitoUserId,
      newToken,
      newExpiresAt,
      githubId,
      githubUsername
    );

    console.log('GitHub token refreshed successfully');
    return newToken;

  } catch (error) {
    console.error('Error refreshing GitHub token:', {
      error,
      errorName: error instanceof Error ? error.name : 'Unknown',
      errorMessage: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });

    // If it's already a GitHubTokenRefreshError, rethrow it
    if ((error as GitHubTokenRefreshError).code) {
      throw error;
    }

    // Otherwise wrap it in our error type
    const refreshError = new Error('Failed to refresh GitHub token') as GitHubTokenRefreshError;
    refreshError.code = 'GITHUB_TOKEN_REFRESH_FAILED';
    throw refreshError;
  }
}

export async function listRepos(
  userId: string,
  options: GitHubRepoListOptions = {}
): Promise<GitHubRepo[]> {
  const accessToken = await getValidGitHubToken(userId);
  const Octokit = await getOctokitModule();
  const octokit = new Octokit({ auth: accessToken });

  const { data: repos } = await octokit.rest.repos.listForAuthenticatedUser({
    sort: options.sort || 'updated',
    direction: options.direction || 'desc',
    per_page: options.per_page || 10
  });

  return repos;
}

export async function getRepoTree(
  userId: string,
  options: GitHubRepoTreeOptions
): Promise<GitHubTreeItem[] | GitHubBlobContent> {
  const accessToken = await getValidGitHubToken(userId);
  const Octokit = await getOctokitModule();
  const octokit = new Octokit({ auth: accessToken });

  const response = await octokit.rest.git.getTree({
    owner: options.owner,
    repo: options.repo,
    tree_sha: options.sha || 'HEAD',
    recursive: options.recursive ? '1' : undefined,
  });

  let filteredTree = response.data.tree;
  if (options.path) {
    const pathPrefix = options.path.split('/').join('/');
    filteredTree = filteredTree.filter((item: GitHubTreeItem) => item.path?.startsWith(pathPrefix));

    if (filteredTree.length === 1 && filteredTree[0].type === 'blob' && filteredTree[0].sha) {
      const blobResponse = await octokit.rest.git.getBlob({
        owner: options.owner,
        repo: options.repo,
        file_sha: filteredTree[0].sha,
      });
      return blobResponse.data;
    }
  }

  return filteredTree;
}

async function updateCognitoAttributes(
  cognitoUserId: string,
  accessToken: string,
  expiresAt: number,
  githubId: string,
  githubUsername: string
): Promise<void> {
  console.log('Updating Cognito attributes:', {
    cognitoUserId,
    accessToken: accessToken.substring(0, 10) + '...',
    expiresAt,
    githubId,
    githubUsername
  });

  const attributes = [
    { Name: 'custom:gh_token', Value: accessToken },
    { Name: 'custom:gh_token_expires', Value: expiresAt.toString() },
    { Name: 'custom:gh_id', Value: githubId },
    { Name: 'custom:gh_username', Value: githubUsername },
  ];

  await cognito.send(new AdminUpdateUserAttributesCommand({
    UserPoolId: process.env.COGNITO_USER_POOL_ID,
    Username: cognitoUserId,
    UserAttributes: attributes,
  }));
}

export const CognitoAttribute = ImportedCognitoAttribute;
