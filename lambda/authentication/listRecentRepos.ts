import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { request } from 'https';

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const accessToken = event.headers.Authorization; // Assume the access token is passed in the Authorization header

  if (!accessToken) {
    return {
      statusCode: 401,
      body: JSON.stringify({
        message: 'Access token is missing.',
      }),
    };
  }

  try {
    const repos = await new Promise<any[]>((resolve, reject) => {
      const options = {
        hostname: 'api.github.com',
        path: '/user/repos?sort=updated',
        method: 'GET',
        headers: {
          'Authorization': `token ${accessToken}`,
          'User-Agent': 'YourAppName', // Replace with your app name
        },
      };

      const req = request(options, (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          resolve(JSON.parse(body));
        });
      });

      req.on('error', (e) => {
        reject(e);
      });

      req.end();
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Recent repositories retrieved successfully',
        repos: repos,
      }),
    };
  } catch (error: unknown) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: 'An error occurred while retrieving recent repositories.',
        error: (error as Error).message,
      }),
    };
  }
};
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { CognitoIdentityServiceProvider } from 'aws-sdk';
import fetch from 'node-fetch';

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const cognito = new CognitoIdentityServiceProvider();
  const userSub = event.requestContext.authorizer?.claims.sub;

  if (!userSub) {
    return {
      statusCode: 401,
      body: JSON.stringify({ message: 'Unauthorized' }),
    };
  }

  try {
    // Retrieve the GitHub token from Cognito
    const userResponse = await cognito.adminGetUser({
      UserPoolId: process.env.COGNITO_USER_POOL_ID!,
      Username: userSub,
    }).promise();

    const githubToken = userResponse.UserAttributes?.find(attr => attr.Name === 'custom:github_token')?.Value;

    if (!githubToken) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: 'GitHub token not found' }),
      };
    }

    // Use the GitHub token to fetch recent repos
    const response = await fetch('https://api.github.com/user/repos?sort=updated&per_page=10', {
      headers: {
        'Authorization': `token ${githubToken}`,
        'Accept': 'application/vnd.github.v3+json',
      },
    });

    if (!response.ok) {
      throw new Error(`GitHub API responded with status ${response.status}`);
    }

    const repos = await response.json();

    return {
      statusCode: 200,
      body: JSON.stringify(repos),
    };
  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
};
