import { CognitoIdentityProviderClient, InitiateAuthCommand } from "@aws-sdk/client-cognito-identity-provider";

const cognitoClient = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION });

export const handler = async (event: any) => {
  console.log('RefreshToken event:', JSON.stringify(event, null, 2));

  const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
  console.log('RefreshToken body:', body);

  try {
    const { refreshToken } = body;
    const clientId = process.env.COGNITO_APP_CLIENT_ID;
    if (!clientId) {
      throw new Error('COGNITO_APP_CLIENT_ID environment variable is not set.');
    }
    if (!refreshToken) {
      throw new Error('Refresh token is required.');
    }

    const command = new InitiateAuthCommand({
      AuthFlow: 'REFRESH_TOKEN_AUTH',
      ClientId: clientId,
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
        body: JSON.stringify({ message: "Token refresh failed or incomplete." }),
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        IdToken,
        AccessToken,
      }),
    };
  } catch (err: any) {
    console.error('RefreshToken error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: err.message || 'An error occurred during the token refresh process.' }),
    };
  }
};
