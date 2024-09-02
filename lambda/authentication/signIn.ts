// cdk/lambda/authentication/signIn.ts
import { CognitoIdentityProviderClient, InitiateAuthCommand, AuthFlowType } from "@aws-sdk/client-cognito-identity-provider";
const cognito = new CognitoIdentityProviderClient({ region: 'us-east-1' });

export const handler = async (event: { body: string }) => {
  const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
  console.log('SignIn body:', body);
  try {
    const { username, password } = body;
    // Ensure ClientId is a string and not undefined
    const clientId = process.env.COGNITO_APP_CLIENT_ID;
    if (!clientId) {
      throw new Error('COGNITO_APP_CLIENT_ID environment variable is not set.');
    }
    const params = {
      AuthFlow: 'USER_PASSWORD_AUTH' as AuthFlowType,
      ClientId: clientId,
      AuthParameters: {
        USERNAME: username,
        PASSWORD: password,
      },
    };
    body.params = params;
    const command = new InitiateAuthCommand(params);
    const data = await cognito.send(command);

    console.log('SignIn success:', JSON.stringify(data));

    const { IdToken, AccessToken, RefreshToken } = data.AuthenticationResult ?? {};

    if (!IdToken || !AccessToken || !RefreshToken) {
      return {
        statusCode: 401,
        body: JSON.stringify({ message: "Authentication failed or incomplete." }),
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        ...data.AuthenticationResult,
        cookies: [
          `idToken=${IdToken}; SameSite=None; Secure; Path=/`,
          `accessToken=${AccessToken}; SameSite=None; Secure; Path=/`,
          `refreshToken=${RefreshToken}; SameSite=None; Secure; Path=/`
        ]
      }),
    };
  } catch (err: any) {
    console.error('SignIn error:', err);
    return {
      statusCode: 400,
      body: JSON.stringify({ message: err.message }),
    };
  }
};
