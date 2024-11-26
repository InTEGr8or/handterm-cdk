import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getRepoTree } from './githubUtils';

/*
  LOGICAL OVERVIEW
  1. If there's no `/` in the repo, use githubUsername as the owner.
  2. If there's a `/`, split the repo into owner and repoName.
  3. If there's a path, use it to get the tree.
  4. If there's no path, use the root to get the tree.
  5. If the result is a blob content (file), format it for response.
  6. If the result is a tree, return it.
*/

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  console.log('authorizer.lambda:', event.requestContext.authorizer?.lambda);
  try {
    const { userId, githubUsername } = event.requestContext.authorizer?.lambda;
    console.log('githubUsername:', githubUsername);
    if (!userId) {
      return { statusCode: 401, body: JSON.stringify({ message: 'Unauthorized' }) };
    }

    const { repo, path, sha } = event.queryStringParameters || {};
    if (!repo) {
      return { statusCode: 400, body: JSON.stringify({ message: 'Missing required parameter: repo' }) };
    }

    const [owner, repoName] = repo.split('/');
    const result = await getRepoTree(userId, {
      owner,
      repo: repoName,
      path,
      sha,
      recursive: path ? true : false
    });

    // If the result is a blob content (file), format it for response
    if ('content' in result) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          content: Buffer.from(result.content, 'base64').toString('utf-8'),
          encoding: result.encoding,
          sha: result.sha,
          size: result.size,
        }),
      };
    }

    // Otherwise, return the tree
    return { statusCode: 200, body: JSON.stringify(result) };
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
