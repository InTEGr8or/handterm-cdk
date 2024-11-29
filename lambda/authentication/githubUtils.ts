// cdk/lambda/authentication/githubUtils.ts
import {
  CognitoIdentityProviderClient,
  AdminGetUserCommand,
  AdminUpdateUserAttributesCommand,
  AttributeType
} from "@aws-sdk/client-cognito-identity-provider";
import type { RestEndpointMethodTypes } from "@octokit/plugin-rest-endpoint-methods";
import type { Octokit as OctokitType } from '@octokit/rest';
import {
  CognitoAttribute as ImportedCognitoAttribute
} from './authTypes';

// Precise type definitions using Octokit's types
type GitHubRepo = RestEndpointMethodTypes["repos"]["listForAuthenticatedUser"]["response"]["data"][0];
type GitHubTreeItem = RestEndpointMethodTypes["git"]["getTree"]["response"]["data"]["tree"][0];
type GitHubBlobContent = RestEndpointMethodTypes["git"]["getBlob"]["response"]["data"];
type GitHubCommitResponse = RestEndpointMethodTypes["repos"]["createOrUpdateFileContents"]["response"]["data"];

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

interface GitHubSaveFileOptions {
  owner: string;
  repo: string;
  path: string;
  content: string;
  message: string;
}

interface GitHubTokenError extends Error {
  code?: 'GITHUB_AUTH_REQUIRED' | 'GITHUB_TOKEN_EXPIRED';
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

type githubTokenResponse = {
  githubToken: string,
  githubUsername: string,
}

export async function getValidGitHubToken(cognitoUserId: string): Promise<githubTokenResponse> {
  console.log('githubUtils: Getting GitHub token for user:', cognitoUserId);

  const user = await cognito.send(new AdminGetUserCommand({
    UserPoolId: process.env.COGNITO_USER_POOL_ID,
    Username: cognitoUserId,
  }));

  const githubToken = user.UserAttributes?.find((attr: AttributeType) => attr.Name === ImportedCognitoAttribute.GH_TOKEN)?.Value;
  const githubUsername = user.UserAttributes?.find((attr: AttributeType) => attr.Name === ImportedCognitoAttribute.GH_USERNAME)?.Value;

  console.log('GitHub user info:', {
    githubUsername,
    hasToken: !!githubToken
  });

  if (!githubToken || !githubUsername) {
    const error = new Error('GitHub account not linked. Please use "github -l" to link your account.') as GitHubTokenError;
    error.code = 'GITHUB_AUTH_REQUIRED';
    throw error;
  }

  return {githubToken, githubUsername};
}

export async function unlinkGitHub(cognitoUserId: string): Promise<void> {
  console.log('githubUtils: Unlinking GitHub for user:', cognitoUserId);

  // Clear GitHub-related attributes
  const attributes = [
    { Name: ImportedCognitoAttribute.GH_TOKEN, Value: '' },
    { Name: ImportedCognitoAttribute.GH_REFRESH_TOKEN, Value: '' },
    { Name: ImportedCognitoAttribute.GH_TOKEN_EXPIRES, Value: '0' },
    { Name: ImportedCognitoAttribute.GH_REFRESH_EXPIRES, Value: '0' },
    { Name: ImportedCognitoAttribute.GH_USERNAME, Value: '' },
    { Name: ImportedCognitoAttribute.GH_ID, Value: '' }
  ];

  await cognito.send(new AdminUpdateUserAttributesCommand({
    UserPoolId: process.env.COGNITO_USER_POOL_ID,
    Username: cognitoUserId,
    UserAttributes: attributes
  }));
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
  const accessTokenResponse = await getValidGitHubToken(userId);
  const Octokit = await getOctokitModule();
  const octokit = new Octokit({ auth: accessTokenResponse.githubToken });

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

export async function saveRepoFile(
  userId: string,
  options: GitHubSaveFileOptions
): Promise<GitHubCommitResponse> {
  const githubTokenResponse = await getValidGitHubToken(userId);
  const Octokit = await getOctokitModule();
  const octokit = new Octokit({ auth: githubTokenResponse.githubToken });

  // First get the current file (if it exists) to get its SHA
  let currentFileSha: string | undefined;
  try {
    const { data: currentFile } = await octokit.repos.getContent({
      owner: options.owner,
      repo: options.repo,
      path: options.path,
    });

    if ('sha' in currentFile) {
      currentFileSha = currentFile.sha;
    }
  } catch (error) {
    // File doesn't exist yet, which is fine
    console.log('File does not exist yet, will create new file');
  }

  // Get the default branch
  const { data: repoData } = await octokit.repos.get({
    owner: options.owner,
    repo: options.repo,
  });

  // Create or update file
  const { data } = await octokit.repos.createOrUpdateFileContents({
    owner: options.owner,
    repo: options.repo,
    path: options.path,
    message: options.message,
    content: Buffer.from(options.content).toString('base64'),
    sha: currentFileSha,
    branch: repoData.default_branch,
  });

  return data;
}

export const CognitoAttribute = ImportedCognitoAttribute;
