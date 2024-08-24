import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { CognitoIdentityServiceProvider } from 'aws-sdk';
import { request } from 'https';

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

    return {
      statusCode: 200,
      body: response,
    };
  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
};
