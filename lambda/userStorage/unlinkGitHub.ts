import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { unlinkGitHub } from '../authentication/githubUtils';

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    // Check for authorizer first
    if (!event.requestContext.authorizer?.lambda) {
      return { statusCode: 401, body: JSON.stringify({ message: 'Unauthorized' }) };
    }

    const { userId } = event.requestContext.authorizer.lambda;
    if (!userId) {
      return { statusCode: 401, body: JSON.stringify({ message: 'Unauthorized' }) };
    }

    await unlinkGitHub(userId);

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'GitHub account unlinked successfully'
      })
    };
  } catch (error) {
    console.error('Error unlinking GitHub:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: 'Failed to unlink GitHub account',
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    };
  }
};
