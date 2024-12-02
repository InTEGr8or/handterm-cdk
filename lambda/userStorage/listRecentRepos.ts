import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { listRepos } from '../authentication/githubUtils';

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    console.log('List recent repos handler invoked');
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

        const cognitoUserId = userId;
        const repos = await listRepos(cognitoUserId);

        return {
            statusCode: 200,
            body: JSON.stringify(repos)
        };
    } catch (error) {
        console.error('Error in list recent repos:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({
                error: 'Failed to retrieve recent repositories',
                details: error instanceof Error ? error.message : String(error)
            })
        };
    }
};
