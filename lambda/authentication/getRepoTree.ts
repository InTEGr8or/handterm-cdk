import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { CognitoIdentityProviderClient, AdminGetUserCommand } from '@aws-sdk/client-cognito-identity-provider';
import { Octokit } from '@octokit/rest';

const cognito = new CognitoIdentityProviderClient({ region: 'us-east-1' });

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    console.log('GetRepoTree Lambda function started');
    console.log('Event:', JSON.stringify(event, null, 2));

    const userId = event.requestContext.authorizer?.lambda?.userId;
    if (!userId) {
        return {
            statusCode: 401,
            body: JSON.stringify({ message: 'Unauthorized: User ID not found' }),
        };
    }

    const { repo, path, sha } = event.queryStringParameters || {};
    if (!repo) {
        return {
            statusCode: 400,
            body: JSON.stringify({ message: 'Missing required parameter: repo' }),
        };
    }

    try {
        // Retrieve the GitHub token from Cognito
        const command = new AdminGetUserCommand({
            UserPoolId: process.env.COGNITO_USER_POOL_ID!,
            Username: userId,
        });
        const userResponse = await cognito.send(command);
        const githubToken = userResponse.UserAttributes?.find(attr => attr.Name === 'custom:github_token')?.Value;

        if (!githubToken) {
            return {
                statusCode: 400,
                body: JSON.stringify({ message: 'GitHub token not found. Please connect your GitHub account.' }),
            };
        }

        // Use the GitHub token to fetch the repo tree
        const octokit = new Octokit({ auth: githubToken });
        const [owner, repoName] = repo.split('/');
        const response = await octokit.rest.git.getTree({
            owner,
            repo: repoName,
            tree_sha: sha || 'HEAD',
            recursive: path ? '1' : undefined,
        });

        // Filter the tree based on the path if provided
        let filteredTree = response.data.tree;
        if (path) {
            const pathPrefix = path ? path.split('/').join('/') : '';
            filteredTree = filteredTree.filter((item: { path?: string }) => item.path?.startsWith(pathPrefix));
        }

        return {
            statusCode: 200,
            body: JSON.stringify(filteredTree),
        };
    } catch (error) {
        console.error('Error in getRepoTree:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ message: 'Internal server error', error: error instanceof Error ? error.message : 'Unknown error' }),
        };
    }
};
