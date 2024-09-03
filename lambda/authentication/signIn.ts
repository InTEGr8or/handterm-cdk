// cdk/lambda/authentication/signIn.ts
import { CognitoIdentityProviderClient, InitiateAuthCommand, AuthFlowType, AdminGetUserCommand } from "@aws-sdk/client-cognito-identity-provider";
const cognito = new CognitoIdentityProviderClient({ region: 'us-east-1' });

export const handler = async (event: { body: string }) => {
  const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
  try {
    const { username, password } = body;
    // Ensure ClientId is a string and not undefined
    const clientId = process.env.COGNITO_APP_CLIENT_ID;
    const userPoolId = process.env.COGNITO_USER_POOL_ID;
    if (!clientId) {
      throw new Error('COGNITO_APP_CLIENT_ID environment variable is not set.');
    }
    if (!userPoolId) {
      throw new Error('COGNITO_USER_POOL_ID environment variable is not set.');
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

    const { IdToken, AccessToken, RefreshToken } = data.AuthenticationResult ?? {};

    if (!IdToken || !AccessToken || !RefreshToken) {
      return {
        statusCode: 401,
        body: JSON.stringify({ message: "Authentication failed or incomplete." }),
      };
    }

    // Fetch user attributes
    const getUserCommand = new AdminGetUserCommand({
      UserPoolId: userPoolId,
      Username: username,
    });
    const userDetails = await cognito.send(getUserCommand);
    console.log('userDetails:', userDetails);

    // Extract GitHub username if it exists
    const githubUsername = userDetails.UserAttributes?.find(attr => attr.Name === 'custom:github_username')?.Value;
    console.log('githubUsername:', githubUsername);
    return {
      statusCode: 200,
      body: JSON.stringify({
        ...data.AuthenticationResult,
        githubUsername,
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
