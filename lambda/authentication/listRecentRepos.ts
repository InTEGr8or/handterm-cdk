import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { CognitoIdentityProviderClient, AdminGetUserCommand, AdminUpdateUserAttributesCommand } from '@aws-sdk/client-cognito-identity-provider';
// Use dynamic import for Octokit
import { CognitoAttribute } from './githubUtils.js';
const getOctokit = async () => {
  try {
    const Octokit = await import('@octokit/rest');
    return Octokit.Octokit;
  } catch (error) {
    console.error('Error importing Octokit:', error);
    throw error;
  }
};

const cognito = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION });

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

export const listRecentRepos = async (userId: string): Promise<APIGatewayProxyResult> => {
  if (!userId) {
    console.error('listRecentRepos called with empty userId');
    return {
      statusCode: 401,
      body: JSON.stringify({ message: 'Unauthorized: Empty user ID' }),
    };
  }

  try {
    // Retrieve the GitHub token from Cognito
    console.log('Retrieving GitHub token for user:', userId);
    const command = new AdminGetUserCommand({
      UserPoolId: process.env.COGNITO_USER_POOL_ID!,
      Username: userId,
    });
    const userResponse = await cognito.send(command);

    console.log('User response:', JSON.stringify(userResponse, null, 2));
    console.log('User attributes:', JSON.stringify(userResponse.UserAttributes, null, 2));

    let githubToken = userResponse.UserAttributes?.find((attr: { Name?: string; Value?: string }) => attr.Name === CognitoAttribute.GH_TOKEN)?.Value;
    let githubRefreshToken = userResponse.UserAttributes?.find((attr: { Name?: string; Value?: string }) => attr.Name === CognitoAttribute.GH_REFRESH_TOKEN)?.Value;

    if (!githubToken || !githubRefreshToken) {
      console.error('GitHub token or refresh token not found for user:', userId);
      console.log('Available attributes:', userResponse.UserAttributes?.map(attr => attr.Name).join(', '));
      return {
        statusCode: 400,
        body: JSON.stringify({ 
          message: 'GitHub token or refresh token not found. Please reconnect your GitHub account.',
          availableAttributes: userResponse.UserAttributes?.map(attr => attr.Name),
          error: 'GITHUB_TOKEN_NOT_FOUND'
        }),
      };
    }

    console.log('GitHub token retrieved successfully');

    const Octokit = await getOctokit();
    const octokit = new Octokit({ auth: githubToken });

    try {
      const { data: repos } = await octokit.rest.repos.listForAuthenticatedUser({
        sort: 'updated',
        per_page: 10
      });
      return {
        statusCode: 200,
        body: JSON.stringify(repos)
      };
    } catch (error: any) {
      if (error.status === 401) {
        console.log('Token expired, attempting to refresh...');
        try {
          githubToken = await refreshGitHubToken(githubRefreshToken);
          
          // Update the user's GitHub token in Cognito
          const updateCommand = new AdminUpdateUserAttributesCommand({
            UserPoolId: process.env.COGNITO_USER_POOL_ID!,
            Username: userId,
            UserAttributes: [
              {
                Name: CognitoAttribute.GH_TOKEN,
                Value: githubToken
              }
            ]
          });
          await cognito.send(updateCommand);

          // Retry the request with the new token
          const octokit = new Octokit({ auth: githubToken });
          const { data: repos } = await octokit.rest.repos.listForAuthenticatedUser({
            sort: 'updated',
            per_page: 10
          });
          return {
            statusCode: 200,
            body: JSON.stringify(repos)
          };
        } catch (refreshError) {
          console.error('Error refreshing token:', refreshError);
          if (refreshError instanceof Error && refreshError.message === 'REFRESH_TOKEN_EXPIRED') {
            const githubAuthRedirectUrl = `${process.env.API_URL}github_auth`;
            return {
              statusCode: 307,
              headers: {
                Location: githubAuthRedirectUrl,
              },
              body: JSON.stringify({ 
                message: 'GitHub authentication expired. Redirecting to re-authenticate.',
                error: 'REFRESH_TOKEN_EXPIRED',
                redirectUrl: githubAuthRedirectUrl
              }),
            };
          }
          throw refreshError;
        }
      }
      throw error;
    }
  } catch (error) {
    console.error('Error in listRecentRepos:', error);
    if (error instanceof Error) {
      return {
        statusCode: 500,
        body: JSON.stringify({ message: 'Internal server error', error: error.message }),
      };
    }
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Internal server error', error: 'Unknown error' }),
    };
  }
};

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    console.log('Event:', JSON.stringify(event, null, 2));
    
    if (!event.requestContext) {
      console.error('Request context is missing');
      return {
        statusCode: 400,
        body: JSON.stringify({ message: 'Bad Request: Missing request context' }),
      };
    }

    const authorizer = event.requestContext.authorizer;
    console.log('Authorizer:', JSON.stringify(authorizer, null, 2));
    
    if (!authorizer) {
      console.error('Authorizer is missing');
      return {
        statusCode: 401,
        body: JSON.stringify({ message: 'Unauthorized: Missing authorizer' }),
      };
    }

    let userId: string | undefined;

    if (authorizer.lambda && authorizer.lambda.userId) {
      userId = authorizer.lambda.userId;
    } else if (authorizer.claims && authorizer.claims.sub) {
      userId = authorizer.claims.sub;
    } else if (authorizer.jwt && authorizer.jwt.claims && authorizer.jwt.claims.sub) {
      userId = authorizer.jwt.claims.sub;
    }

    console.log('User ID:', userId);
    
    if (!userId) {
      console.error('User ID not found in the authorizer');
      return {
        statusCode: 401,
        body: JSON.stringify({ message: 'Unauthorized: User ID not found', authorizer: JSON.stringify(authorizer) }),
      };
    }

    const repos = await listRecentRepos(userId);
    return {
      statusCode: 200,
      body: JSON.stringify(repos),
    };
  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Internal server error', error: (error as Error).message }),
    };
  }
};
