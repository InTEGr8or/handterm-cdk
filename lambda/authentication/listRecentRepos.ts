import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { CognitoIdentityProviderClient, GetUserCommand } from '@aws-sdk/client-cognito-identity-provider';
import { getValidGitHubToken } from './githubUtils';

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    console.log('List recent repos handler invoked');

    try {
        const authToken = event.headers?.Authorization || event.headers?.authorization;
        if (!authToken) {
            return {
                statusCode: 401,
                body: JSON.stringify({ error: 'No authorization token provided' })
            };
        }

        const token = authToken.startsWith('Bearer ') ? authToken.split(' ')[1] : authToken;

        // Initialize the client inside the handler
        const cognito = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION });
        const getUserCommand = new GetUserCommand({ AccessToken: token });
        const userResponse = await cognito.send(getUserCommand);
        const cognitoUserId = userResponse.Username;

        if (!cognitoUserId) {
            return {
                statusCode: 401,
                body: JSON.stringify({ error: 'Invalid user' })
            };
        }

        const githubToken = await getValidGitHubToken(cognitoUserId);

        // Dynamically import Octokit
        const { Octokit } = await import('@octokit/rest');

        const octokit = new Octokit({
            auth: githubToken
        });

        const { data: repos } = await octokit.repos.listForAuthenticatedUser({
            sort: 'updated',
            direction: 'desc',
            per_page: 10
        });

        return {
            statusCode: 200,
            body: JSON.stringify(repos.map(repo => ({
                name: repo.name,
                full_name: repo.full_name,
                description: repo.description,
                html_url: repo.html_url,
                updated_at: repo.updated_at
            })))
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
