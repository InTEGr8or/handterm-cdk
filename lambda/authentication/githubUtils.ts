// cdk/lambda/authentication/githubUtils.ts
import {
  CognitoIdentityProviderClient,
  AdminGetUserCommand,
  AdminUpdateUserAttributesCommand,
  AttributeType
} from "@aws-sdk/client-cognito-identity-provider";
import type { RestEndpointMethodTypes } from "@octokit/plugin-rest-endpoint-methods";
import {
  CognitoAttribute as ImportedCognitoAttribute
} from './authTypes';

// Precise type definitions using Octokit's types
type GitHubRepo = RestEndpointMethodTypes["repos"]["listForAuthenticatedUser"]["response"]["data"][0];
type GitHubTreeItem = RestEndpointMethodTypes["git"]["getTree"]["response"]["data"]["tree"][0];
type GitHubBlobContent = RestEndpointMethodTypes["git"]["getBlob"]["response"]["data"];

// Extended Octokit type with REST methods
type OctokitWithRest = any;

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
  code?: 'GITHUB_AUTH_REQUIRED' | 'GITHUB_TOKEN_REFRESH_FAILED';
}

interface GitHubAuthResponse {
  token: string;
  type: string;
  tokenType?: string;
  expiresAt?: string;
}

const cognito = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION });

async function getOctokitModule() {
  try {
    const { Octokit } = await import('@octokit/rest');
    return Octokit;
  } catch (error) {
    console.error('Error importing Octokit:', error);
    throw error;
  }
}

async function getAppModule() {
  try {
    const { App } = await import('@octokit/app');
    return App;
  } catch (error) {
    console.error('Error importing App:', error);
    throw error;
  }
}

export async function getValidGitHubToken(cognitoUserId: string): Promise<string> {
  console.log('githubUtils: Getting valid GitHub token for user:', cognitoUserId);

  // Validate required GitHub App environment variables
  if (!process.env.GITHUB_APP_ID || !process.env.GITHUB_APP_PRIVATE_KEY) {
    const error = new Error('GitHub App configuration is missing') as GitHubTokenRefreshError;
    error.code = 'GITHUB_AUTH_REQUIRED';
    throw error;
  }

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
    const app = new App({
      appId: process.env.GITHUB_APP_ID,
      privateKey: process.env.GITHUB_APP_PRIVATE_KEY,
    });

    // Find the installation for the specific user
    const { data: installation } = await (app.octokit as OctokitWithRest).rest.apps.getUserInstallation({
      username: githubUsername
    });

    if (!installation.id) {
      const error = new Error(`No GitHub App installation found for user: ${githubUsername}`) as GitHubTokenRefreshError;
      error.code = 'GITHUB_AUTH_REQUIRED';
      throw error;
    }

    // Get an installation Octokit instance
    const octokit = await app.getInstallationOctokit(installation.id);
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
    console.error('Error refreshing GitHub token:', error);
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
