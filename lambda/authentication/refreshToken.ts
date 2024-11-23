import { CognitoIdentityProviderClient, InitiateAuthCommand } from "@aws-sdk/client-cognito-identity-provider";

const cognitoClient = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION });

export const handler = async (event: any) => {
  console.log('RefreshToken event:', JSON.stringify(event, null, 2));

  const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
  console.log('RefreshToken body:', body);

  try {
    const { refreshToken } = body;
    const userPoolClientId = process.env.COGNITO_USER_POOL_CLIENT_ID;
    if (!userPoolClientId) {
      throw new Error('COGNITO_USER_POOL_CLIENT_ID environment variable is not set.');
    }
    if (!refreshToken) {
      throw new Error('Refresh token is required.');
    }

    console.log('Initiating auth with clientId:', userPoolClientId);
    const command = new InitiateAuthCommand({
      AuthFlow: 'REFRESH_TOKEN_AUTH',
      ClientId: userPoolClientId,
      AuthParameters: {
        REFRESH_TOKEN: refreshToken,
      },
    });

    const data = await cognitoClient.send(command);
    console.log('RefreshToken success:', JSON.stringify(data));

    const { IdToken, AccessToken } = data.AuthenticationResult ?? {};

    if (!IdToken || !AccessToken) {
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': 'http://localhost:5173',
          'Access-Control-Allow-Credentials': 'true'
        },
        body: JSON.stringify({ message: "Token refresh failed or incomplete." }),
      };
    }
    console.log('RefreshToken success: IdToken and AccessToken received.', IdToken)
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': 'http://localhost:5173',
        'Access-Control-Allow-Credentials': 'true'
      },
      body: JSON.stringify({
        IdToken,
        AccessToken,
        RefreshToken: refreshToken, // Include the original refresh token in the response
      }),
    };
  } catch (err: any) {
    console.error('RefreshToken error:', err);
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': 'http://localhost:5173',
        'Access-Control-Allow-Credentials': 'true'
      },
      body: JSON.stringify({
        message: err.message || 'An error occurred during the token refresh process.',
        error: err instanceof Error ? err.message : String(err)
      }),
    };
  }
};
