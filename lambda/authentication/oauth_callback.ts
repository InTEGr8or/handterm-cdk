import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { request } from 'https';

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

    // Here, you would typically exchange the GitHub access token for Cognito tokens
    // This might involve calling a Cognito API or using AWS SDK to update user attributes

    // For demonstration, let's assume we store the access token in a user attribute
    // You would replace this with actual Cognito interaction logic

    // Placeholder for Cognito interaction
    const cognitoResponse = {
      message: 'Cognito interaction successful',
      // Add any relevant data from Cognito interaction
    };

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'OAuth callback handled successfully',
        accessToken: tokenData.access_token,
        cognitoResponse: cognitoResponse,
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
