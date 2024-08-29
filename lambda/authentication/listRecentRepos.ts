import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { CognitoIdentityProviderClient, AdminGetUserCommand } from '@aws-sdk/client-cognito-identity-provider';
import { request } from 'https';

const cognito = new CognitoIdentityProviderClient({ region: 'us-east-1' });

export const listRecentRepos = async (userSub: string): Promise<any[] | { statusCode: number; body: string }> => {
  if (!userSub) {
    return {
      statusCode: 401,
      body: JSON.stringify({ message: 'Unauthorized' }),
    };
  }

  try {
    // Retrieve the GitHub token from Cognito
    const command = new AdminGetUserCommand({
      UserPoolId: process.env.COGNITO_USER_POOL_ID!,
      Username: userSub,
    });
    const userResponse = await cognito.send(command);

    const githubToken = userResponse.UserAttributes?.find((attr: { Name?: string; Value?: string }) => attr.Name === 'custom:github_token')?.Value;

    if (!githubToken) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: 'GitHub token not found' }),
      };
    }

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
        res.on('end', () => resolve(data));
      });

      req.on('error', (error: Error) => reject(error));
      req.end();
    });

    return JSON.parse(response);
  } catch (error) {
    console.error('Error:', error);
    throw error;
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
      console.error('User sub not found in the claims');
      return {
        statusCode: 401,
        body: JSON.stringify({ message: 'Unauthorized: User sub not found' }),
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
