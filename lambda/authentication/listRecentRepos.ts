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
