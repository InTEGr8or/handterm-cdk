import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import * as AWS from 'aws-sdk';

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const redirectUri = process.env.REDIRECT_URI;

  if (!clientId || !redirectUri) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: 'GitHub client ID or redirect URI is not set.',
      }),
    };
  }

  // Extract Cognito User ID from the Authorization header
  const authHeader = event.headers['Authorization'] || event.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return {
      statusCode: 401,
      body: JSON.stringify({
        message: 'No valid Authorization header provided',
      }),
    };
  }

  const token = authHeader.split(' ')[1];
  const cognitoUserId = await getCognitoUserIdFromToken(token);

  if (!cognitoUserId) {
    return {
      statusCode: 401,
      body: JSON.stringify({
        message: 'Invalid or expired token',
      }),
    };
  }

  const state = Buffer.from(JSON.stringify({
    timestamp: Date.now(),
    cognitoUserId: cognitoUserId,
  })).toString('base64');

  const githubAuthUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&scope=read:user,user:email&state=${state}`;

  return {
    statusCode: 302,
    headers: {
      Location: githubAuthUrl,
    },
    body: '',
  };
};

async function getCognitoUserIdFromToken(token: string): Promise<string | null> {
  const cognito = new AWS.CognitoIdentityServiceProvider();
  try {
    const user = await cognito.getUser({ AccessToken: token }).promise();
    return user.Username;
  } catch (error) {
    console.error('Error getting Cognito user:', error);
    return null;
  }
}
