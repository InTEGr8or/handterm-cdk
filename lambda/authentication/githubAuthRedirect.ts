import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { CognitoIdentityServiceProvider } from 'aws-sdk';

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const redirectUri = process.env.REDIRECT_URI;
  const cognitoAuthToken = event.headers['Authorization'];

  if (!clientId || !redirectUri) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: 'GitHub client ID or redirect URI is not set.',
      }),
    };
  }

  if (!cognitoAuthToken) {
    return {
      statusCode: 401,
      body: JSON.stringify({
        message: 'No Cognito authentication token provided.',
      }),
    };
  }

  try {
    const cognito = new CognitoIdentityServiceProvider();
    const cognitoUserInfo = await cognito.getUser({ AccessToken: cognitoAuthToken.split(' ')[1] }).promise();
    
    const state = Buffer.from(JSON.stringify({
      cognitoUserId: cognitoUserInfo.Username,
      cognitoToken: cognitoAuthToken
    })).toString('base64');

    const githubAuthUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&scope=read:user,user:email&state=${state}`;

    return {
      statusCode: 302,
      headers: {
        Location: githubAuthUrl,
      },
      body: '',
    };
  } catch (error) {
    console.error('Error getting Cognito user info:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: 'Failed to authenticate with Cognito',
        error: (error as Error).message,
      }),
    };
  }
};
