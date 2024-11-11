// cdk/lambda/authentication/signIn.ts
import {
  CognitoIdentityProviderClient,
  InitiateAuthCommand,
  AdminGetUserCommand,
  AttributeType
} from "@aws-sdk/client-cognito-identity-provider";
import {
  APIGatewayProxyEvent,
  APIGatewayProxyResult,
  CognitoAttribute
} from './authTypes';

const cognito = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION });

console.log('SignUp module loaded');

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;

  try {
    const { username, password } = body;
    const clientId = process.env.COGNITO_APP_CLIENT_ID;
    const userPoolId = process.env.COGNITO_USER_POOL_ID;

    if (!clientId || !userPoolId) {
      throw new Error('Missing required environment variables.');
    }

    const authCommand = new InitiateAuthCommand({
      AuthFlow: 'USER_PASSWORD_AUTH',
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

    const githubUsername = userDetails.UserAttributes?.find((attr: AttributeType) => attr.Name === CognitoAttribute.GH_USERNAME)?.Value;

    return {
      statusCode: 200,
      body: JSON.stringify({
        ...authResponse.AuthenticationResult,
        AccessToken,
        IdToken,
        RefreshToken,
        githubUsername,
        cookies: [
          `idToken=${IdToken}; SameSite=None; Secure; Path=/`,
          `accessToken=${AccessToken}; SameSite=None; Secure; Path=/`,
          `refreshToken=${RefreshToken}; SameSite=None; Secure; Path=/`
        ]
      }),
      headers: {
        'Set-Cookie': [
          `idToken=${IdToken}; HttpOnly; Secure; SameSite=Strict; Path=/`,
          `accessToken=${AccessToken}; HttpOnly; Secure; SameSite=Strict; Path=/`,
          `refreshToken=${RefreshToken}; HttpOnly; Secure; SameSite=Strict; Path=/`
        ].join(', ')
      }
    };
  } catch (err: unknown) {
    console.error('SignIn error:', err);
    if (err && typeof err === 'object' && '__type' in err) {
      const typedError = err as { __type: string };
      if (typedError.__type === 'UserNotConfirmedException') {
        return {
          statusCode: 400,
          body: JSON.stringify({
            code: 'UserNotConfirmed',
            message: 'User is not confirmed. Please check your email and confirm your account.'
          }),
        };
      } else if (typedError.__type === 'NotAuthorizedException') {
        return {
          statusCode: 401,
          body: JSON.stringify({
            code: 'NotAuthorized',
            message: 'Incorrect username or password.'
          }),
        };
      } else if (typedError.__type === 'UserNotFoundException') {
        return {
          statusCode: 404,
          body: JSON.stringify({
            code: 'UserNotFound',
            message: 'User does not exist.'
          }),
        };
      }
    }
    return {
      statusCode: 500,
      body: JSON.stringify({
        code: 'InternalServerError',
        message: 'An unexpected error occurred. Please try again later.',
        error: err instanceof Error ? err.message : 'Unknown error'
      }),
    };
  }
}

// Compatibility export for CommonJS
module.exports = {
  handler
};

console.log('Module exports:', module.exports, null, 2);
console.log('Export keys:', Object.keys(module.exports));
console.log('Handler type:', typeof module.exports.handler);
