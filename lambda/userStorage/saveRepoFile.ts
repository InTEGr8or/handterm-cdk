import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { saveRepoFile as saveFile } from '../authentication/githubUtils';

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  console.log('authorizer.lambda:', event.requestContext.authorizer?.lambda);
  try {
    // Check for authorizer first
    if (!event.requestContext.authorizer?.lambda) {
      return { statusCode: 401, body: JSON.stringify({ message: 'Unauthorized' }) };
    }

    const { userId, githubUsername } = event.requestContext.authorizer.lambda;
    console.log('githubUsername:', githubUsername);
    if (!userId) {
      return { statusCode: 401, body: JSON.stringify({ message: 'Unauthorized' }) };
    }

    // Get required parameters
    const { repo, path, message } = event.queryStringParameters || {};
    const content = event.body; // File content should be in request body

    if (!repo || !path || !content || !message) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          message: 'Missing required parameters. Need: repo, path, content, and message'
        })
      };
    }

    // Parse owner and repo name
    const [ownerParsed, repoName] = repo.includes('/') ? repo.split('/') : [githubUsername, repo];
    const owner = ownerParsed === `~` ? githubUsername : ownerParsed
    // Save the file
    const result = await saveFile(userId, {
      owner,
      repo: repoName,
      path,
      content,
      message
    });

    // Handle possible null content in response
    if (!result.content || !result.commit) {
      throw new Error('Invalid response from GitHub API');
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        commit: {
          sha: result.commit.sha,
          url: result.commit.html_url,
        },
        content: {
          sha: result.content.sha,
        },
      }),
    };
  } catch (error) {
    console.error('Error in saveRepoFile:', error);
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
