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
      // Handle the missing tokens scenario, perhaps by throwing an error or returning an error response
      return {
        statusCode: 401,
        body: JSON.stringify({ message: "Authentication failed or incomplete." }),
      };
    }

    // Concatenate the Set-Cookie strings into a single header value
    const response = {
      statusCode: 200,
      body: JSON.stringify(data.AuthenticationResult),
      cookies: [
        `idToken=${IdToken}; SameSite=None; Secure; Path=/`,
        `accessToken=${AccessToken}; SameSite=None; Secure; Path=/`,
        `refreshToken=${RefreshToken}; SameSite=None; Secure; Path=/`
      ]
    };
    return response;
  } catch (err: any) {
    console.error('SignIn error:', err);
    const response = {
      statusCode: 400,
      headers: {
        "Access-Control-Allow-Origin": event.headers?.origin && ['http://localhost:5173', 'https://handterm.com'].includes(event.headers.origin)
          ? event.headers.origin
          : 'http://localhost:5173',
        "Access-Control-Allow-Credentials": 'true',
      },
      body: JSON.stringify(err.message),
      error: err
    };

    return response;
  }
};
