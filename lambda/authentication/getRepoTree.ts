import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { CognitoIdentityProviderClient, AdminGetUserCommand, AdminUpdateUserAttributesCommand } from '@aws-sdk/client-cognito-identity-provider';
import { Octokit } from '@octokit/rest';
import fetch from 'node-fetch';

const cognito = new CognitoIdentityProviderClient({ region: 'us-east-1' });

const refreshGitHubToken = async (refreshToken: string): Promise<string> => {
    const response = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        },
        body: JSON.stringify({
            client_id: process.env.GITHUB_CLIENT_ID,
            client_secret: process.env.GITHUB_CLIENT_SECRET,
            refresh_token: refreshToken,
            grant_type: 'refresh_token',
        }),
    });

    const data: any = await response.json();
    console.log('GitHub token refresh response:', JSON.stringify(data, null, 2));

    if ('error' in data && typeof data.error === 'string') {
        console.error('Error refreshing token:', data);
        if (data.error === 'bad_verification_code' || data.error === 'bad_refresh_token') {
            throw new Error('REFRESH_TOKEN_EXPIRED');
        }
        throw new Error(`Failed to refresh token: ${data.error_description || 'Unknown error'}`);
    }

    if (!('access_token' in data) || typeof data.access_token !== 'string') {
        throw new Error('No access token in refresh response');
    }

    return data.access_token;
};

const updateGitHubToken = async (userId: string, newToken: string): Promise<void> => {
    const command = new AdminUpdateUserAttributesCommand({
        UserPoolId: process.env.COGNITO_USER_POOL_ID!,
        Username: userId,
        UserAttributes: [
            {
                Name: 'custom:github_token',
                Value: newToken,
            },
        ],
    });
    await cognito.send(command);
};

const fetchRepoTree = async (octokit: Octokit, owner: string, repo: string, sha: string | undefined, path: string | undefined): Promise<any> => {
    try {
        const response = await octokit.rest.git.getTree({
            owner,
            repo,
            tree_sha: sha || 'HEAD',
            recursive: path ? '1' : undefined,
        });

        let filteredTree = response.data.tree;
        if (path) {
            const pathPrefix = path.split('/').join('/');
            filteredTree = filteredTree.filter((item: { path?: string }) => item.path?.startsWith(pathPrefix));
        }

        return filteredTree;
    } catch (error: any) {
        if (error.status === 401) {
            throw new Error('TOKEN_EXPIRED');
        }
        throw error;
    }
};

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
        const command = new AdminGetUserCommand({
            UserPoolId: process.env.COGNITO_USER_POOL_ID!,
            Username: userId,
        });
        const userResponse = await cognito.send(command);
        let githubToken = userResponse.UserAttributes?.find(attr => attr.Name === 'custom:github_token')?.Value;
        const githubRefreshToken = userResponse.UserAttributes?.find(attr => attr.Name === 'custom:github_refresh_token')?.Value;

        if (!githubToken || !githubRefreshToken) {
            return {
                statusCode: 401,
                body: JSON.stringify({ 
                    message: 'GitHub tokens not found. Please reconnect your GitHub account.',
                    error: 'GITHUB_TOKENS_NOT_FOUND',
                    action: 'REAUTHENTICATE'
                }),
            };
        }

        const [owner, repoName] = repo.split('/');
        let octokit = new Octokit({ auth: githubToken });

        try {
            const treeData = await fetchRepoTree(octokit, owner, repoName, sha, path);
            return {
                statusCode: 200,
                body: JSON.stringify(treeData),
            };
        } catch (error) {
            if (error instanceof Error && error.message === 'TOKEN_EXPIRED') {
                console.log('Token expired, attempting to refresh...');
                try {
                    githubToken = await refreshGitHubToken(githubRefreshToken);
                    await updateGitHubToken(userId, githubToken);
                    octokit = new Octokit({ auth: githubToken });
                    const treeData = await fetchRepoTree(octokit, owner, repoName, sha, path);
                    return {
                        statusCode: 200,
                        body: JSON.stringify(treeData),
                    };
                } catch (refreshError) {
                    console.error('Error refreshing token:', refreshError);
                    if (refreshError instanceof Error && refreshError.message === 'REFRESH_TOKEN_EXPIRED') {
                        return {
                            statusCode: 401,
                            body: JSON.stringify({ 
                                message: 'GitHub authentication expired. Please reconnect your GitHub account.',
                                error: 'REFRESH_TOKEN_EXPIRED',
                                action: 'REAUTHENTICATE'
                            }),
                        };
                    }
                    return {
                        statusCode: 401,
                        body: JSON.stringify({ 
                            message: 'Failed to refresh GitHub token. Please try again or reconnect your GitHub account.',
                            error: 'GITHUB_TOKEN_REFRESH_FAILED',
                            action: 'REAUTHENTICATE'
                        }),
                    };
                }
            }
            throw error;
        }
    } catch (error) {
        console.error('Error in getRepoTree:', error);
        if (error instanceof Error && error.message === 'REFRESH_TOKEN_EXPIRED') {
            return {
                statusCode: 401,
                body: JSON.stringify({ 
                    message: 'GitHub authentication expired', 
                    error: 'REFRESH_TOKEN_EXPIRED',
                    action: 'REAUTHENTICATE'
                }),
            };
        }
        return {
            statusCode: 500,
            body: JSON.stringify({ 
                message: 'Internal server error', 
                error: error instanceof Error ? error.message : 'Unknown error',
                action: 'RETRY'
            }),
        };
    }
};
