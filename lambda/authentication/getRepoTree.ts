import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { Octokit } from '@octokit/rest';
import { getValidGitHubToken } from './githubUtils.js';

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const userId = event.requestContext.authorizer?.lambda?.userId;
    if (!userId) {
      return { statusCode: 401, body: JSON.stringify({ message: 'Unauthorized' }) };
    }

    const { repo, path, sha } = event.queryStringParameters || {};
    if (!repo) {
      return { statusCode: 400, body: JSON.stringify({ message: 'Missing required parameter: repo' }) };
    }

    const accessToken = await getValidGitHubToken(userId);
    const octokit = new Octokit({ auth: accessToken });

    const [owner, repoName] = repo.split('/');
    const response = await octokit.rest.git.getTree({
      owner,
      repo: repoName,
      tree_sha: sha || 'HEAD',
      recursive: path ? '1' : undefined,
    });

    let filteredTree = response.data.tree;
    if (path) {
      const pathPrefix = path.split('/').join('/');
      filteredTree = filteredTree.filter((item: { path?: string }) => item.path?.startsWith(pathPrefix));

      if (filteredTree.length === 1 && filteredTree[0].type === 'blob' && filteredTree[0].sha) {
        const blobResponse = await octokit.rest.git.getBlob({
          owner,
          repo: repoName,
          file_sha: filteredTree[0].sha,
        });
        return {
          statusCode: 200,
          body: JSON.stringify({
            content: Buffer.from(blobResponse.data.content, 'base64').toString('utf-8'),
            encoding: blobResponse.data.encoding,
            sha: blobResponse.data.sha,
            size: blobResponse.data.size,
          }),
        };
      }
    }

    return { statusCode: 200, body: JSON.stringify(filteredTree) };
  } catch (error) {
    console.error('Error in getRepoTree:', error);
    if (error instanceof Error) {
      if (error.message === 'GitHub tokens not found' || 
          error.message.includes('GitHub refresh token is invalid or expired') ||
          error.message === 'GitHub re-authentication required') {
        return {
          statusCode: 401,
          body: JSON.stringify({ 
            message: 'GitHub authentication required',
            error: 'GITHUB_AUTH_REQUIRED',
            action: 'REAUTHENTICATE'
          }),
        };
      }
      if (error.message === 'Failed to refresh GitHub token') {
        return {
          statusCode: 401,
          body: JSON.stringify({ 
            message: 'Failed to refresh GitHub token. Please reauthenticate.',
            error: 'GITHUB_TOKEN_REFRESH_FAILED',
            action: 'REAUTHENTICATE'
          }),
        };
      }
    }
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        message: 'An unexpected error occurred',
        error: 'INTERNAL_SERVER_ERROR',
        action: 'RETRY_OR_CONTACT_SUPPORT'
      }),
    };
  }
};
