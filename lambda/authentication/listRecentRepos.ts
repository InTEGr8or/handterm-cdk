import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { CognitoIdentityProviderClient, AdminGetUserCommand } from '@aws-sdk/client-cognito-identity-provider';
import { request } from 'https';

const cognito = new CognitoIdentityProviderClient({ region: 'us-east-1' });

export const listRecentRepos = async (userSub: string): Promise<any[] | { statusCode: number; body: string }> => {
  if (!userSub) {
    console.error('listRecentRepos called with empty userSub');
    return {
      statusCode: 401,
      body: JSON.stringify({ message: 'Unauthorized: Empty user sub' }),
    };
  }

  try {
    // Retrieve the GitHub token from Cognito
    console.log('Retrieving GitHub token for user:', userSub);
    const command = new AdminGetUserCommand({
      UserPoolId: process.env.COGNITO_USER_POOL_ID!,
      Username: userSub,
    });
    const userResponse = await cognito.send(command);

    console.log('User response:', JSON.stringify(userResponse, null, 2));
    console.log('User attributes:', JSON.stringify(userResponse.UserAttributes, null, 2));

    const githubToken = userResponse.UserAttributes?.find((attr: { Name?: string; Value?: string }) => attr.Name === 'custom:github_token')?.Value;

    if (!githubToken) {
      console.error('GitHub token not found for user:', userSub);
      console.log('Available attributes:', userResponse.UserAttributes?.map(attr => attr.Name).join(', '));
      return {
        statusCode: 400,
        body: JSON.stringify({ 
          message: 'GitHub token not found. Please connect your GitHub account.',
          availableAttributes: userResponse.UserAttributes?.map(attr => attr.Name),
          error: 'GITHUB_TOKEN_NOT_FOUND'
        }),
      };
    }

    console.log('GitHub token retrieved successfully');

    // Use the GitHub token to fetch recent repos
    const response = await new Promise<string>((resolve, reject) => {
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
          } else {
            reject(new Error(`GitHub API responded with status code ${res.statusCode}`));
          }
        });
      });

      req.on('error', (error: Error) => reject(error));
      req.end();
    });

    return JSON.parse(response);
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

    let userSub: string | undefined;

    if (authorizer.lambda && authorizer.lambda.userId) {
      userSub = authorizer.lambda.userId;
    } else if (authorizer.claims && authorizer.claims.sub) {
      userSub = authorizer.claims.sub;
    } else if (authorizer.jwt && authorizer.jwt.claims && authorizer.jwt.claims.sub) {
      userSub = authorizer.jwt.claims.sub;
    }

    console.log('User Sub:', userSub);
    
    if (!userSub) {
      console.error('User sub not found in the authorizer');
      return {
        statusCode: 401,
        body: JSON.stringify({ message: 'Unauthorized: User sub not found', authorizer: JSON.stringify(authorizer) }),
      };
    }

    // Validate userSub format
    const userSubRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!userSubRegex.test(userSub)) {
      console.error('Invalid user sub format:', userSub);
      return {
        statusCode: 400,
        body: JSON.stringify({ message: 'Bad Request: Invalid user sub format' }),
      };
    }
    
    const repos = await listRecentRepos(userSub);
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
