import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { request } from 'https';
import { CognitoIdentityServiceProvider } from 'aws-sdk';

interface TokenData {
  access_token?: string;
  error?: string;
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  console.log('OAuth callback received:', event);

  const code = event.queryStringParameters?.code;

  if (!code) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        message: 'Authorization code is missing.',
      }),
    };
  }

  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: 'GitHub client ID or client secret is not set.',
      }),
    };
  }

  try {
    const tokenData = await new Promise<TokenData>((resolve, reject) => {
      const data = JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code: code,
      });

      const options = {
        hostname: 'github.com',
        path: '/login/oauth/access_token',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Content-Length': data.length,
        },
      };

      const req = request(options, (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          resolve(JSON.parse(body) as TokenData);
        });
      });

      req.on('error', (e) => {
        reject(e);
      });

      req.write(data);
      req.end();
    });

    if (tokenData.error) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          message: 'Failed to exchange authorization code for access token.',
          error: tokenData.error,
        }),
      };
    }

    // Exchange the GitHub access token for Cognito tokens
    const cognito = new CognitoIdentityServiceProvider();
    const userSub = event.requestContext.authorizer?.claims.sub;

    if (!userSub) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          message: 'User is not authenticated.',
        }),
      };
    }

    const updateParams = {
      UserAttributes: [
        {
          Name: 'custom:github_token',
          Value: tokenData.access_token,
        },
      ],
      UserPoolId: process.env.COGNITO_USER_POOL_ID!,
      Username: userSub,
    };

    await cognito.adminUpdateUserAttributes(updateParams).promise();

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'GitHub token stored successfully',
      }),
    };
  } catch (error: unknown) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: 'An error occurred while handling the OAuth callback.',
        error: (error as Error).message,
      }),
    };
  }
};
