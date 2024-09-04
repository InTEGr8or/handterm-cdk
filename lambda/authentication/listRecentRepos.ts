import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { CognitoIdentityProviderClient, AdminGetUserCommand, AdminUpdateUserAttributesCommand } from '@aws-sdk/client-cognito-identity-provider';
import { request } from 'https';

const cognito = new CognitoIdentityProviderClient({ region: 'us-east-1' });

const refreshGitHubToken = async (userId: string, refreshToken: string): Promise<string> => {
  // Implement the token refresh logic here
  // This is a placeholder and needs to be implemented based on your GitHub App's refresh token mechanism
  console.log('Refreshing GitHub token...');
  // TODO: Implement the actual refresh logic
  return 'new_github_token';
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

    let githubToken = userResponse.UserAttributes?.find((attr: { Name?: string; Value?: string }) => attr.Name === 'custom:github_token')?.Value;
    let githubRefreshToken = userResponse.UserAttributes?.find((attr: { Name?: string; Value?: string }) => attr.Name === 'custom:github_refresh_token')?.Value;

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

    // Use the GitHub token to fetch recent repos
    const fetchRepos = async (token: string): Promise<string> => {
      return new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.github.com',
        path: '/user/repos?sort=updated&per_page=10',
        method: 'GET',
        headers: {
          'Authorization': `token ${githubToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'AWS Lambda'
        }
      };

        const req = request(options, (res: any) => {
          let data = '';
          res.on('data', (chunk: any) => data += chunk);
          res.on('end', () => {
            if (res.statusCode === 200) {
              resolve(data);
            } else if (res.statusCode === 401) {
              reject(new Error('TOKEN_EXPIRED'));
            } else {
              reject(new Error(`GitHub API responded with status code ${res.statusCode}`));
            }
          });
        });

        req.on('error', (error: Error) => reject(error));
        req.end();
      });
    };

    try {
      const response = await fetchRepos(githubToken);
      return JSON.parse(response);
    } catch (error) {
      if (error instanceof Error && error.message === 'TOKEN_EXPIRED') {
        console.log('Token expired, attempting to refresh...');
        githubToken = await refreshGitHubToken(userId, githubRefreshToken);
        
        // Update the user's GitHub token in Cognito
        const updateCommand = new AdminUpdateUserAttributesCommand({
          UserPoolId: process.env.COGNITO_USER_POOL_ID!,
          Username: userId,
          UserAttributes: [
            {
              Name: 'custom:github_token',
              Value: githubToken
            }
          ]
        });
        await cognito.send(updateCommand);

        // Retry the request with the new token
        const response = await fetchRepos(githubToken);
        return JSON.parse(response);
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
