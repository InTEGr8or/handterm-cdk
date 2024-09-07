// cdk/lambda/authentication/signIn.ts
import { CognitoIdentityProviderClient, InitiateAuthCommand, AuthFlowType, AdminGetUserCommand } from "@aws-sdk/client-cognito-identity-provider";
import { CognitoAttribute } from "./githubUtils";

const cognito = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION });

export const handler = async (event: { body: string }) => {
  const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
  
  try {
    const { username, password } = body;
    const clientId = process.env.COGNITO_APP_CLIENT_ID;
    const userPoolId = process.env.COGNITO_USER_POOL_ID;

    if (!clientId || !userPoolId) {
      throw new Error('Missing required environment variables.');
    }

    const authCommand = new InitiateAuthCommand({
      AuthFlow: 'USER_PASSWORD_AUTH' as AuthFlowType,
      ClientId: clientId,
      AuthParameters: {
        USERNAME: username,
        PASSWORD: password,
      },
    });

    const authResponse = await cognito.send(authCommand);
    const { IdToken, AccessToken, RefreshToken } = authResponse.AuthenticationResult ?? {};

    if (!IdToken || !AccessToken || !RefreshToken) {
      return {
        statusCode: 401,
        body: JSON.stringify({ message: "Authentication failed or incomplete." }),
      };
    }

    const getUserCommand = new AdminGetUserCommand({
      UserPoolId: userPoolId,
      Username: username,
    });
    const userDetails = await cognito.send(getUserCommand);

    const githubUsername = userDetails.UserAttributes?.find(attr => attr.Name === CognitoAttribute.GH_USERNAME)?.Value;

    return {
      statusCode: 200,
      body: JSON.stringify({
        idToken: IdToken,
        accessToken: AccessToken,
        refreshToken: RefreshToken,
        githubUsername,
      }),
      headers: {
        'Set-Cookie': [
          `idToken=${IdToken}; HttpOnly; Secure; SameSite=Strict; Path=/`,
          `accessToken=${AccessToken}; HttpOnly; Secure; SameSite=Strict; Path=/`,
          `refreshToken=${RefreshToken}; HttpOnly; Secure; SameSite=Strict; Path=/`
        ].join(', ')
      }
    };
  } catch (err: any) {
    console.error('SignIn error:', err);
    return {
      statusCode: 400,
      body: JSON.stringify({ message: err.message }),
    };
  }
};
