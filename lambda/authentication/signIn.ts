// cdk/lambda/authentication/signIn.ts
import * as AWS from 'aws-sdk';
const cognito = new AWS.CognitoIdentityServiceProvider({ region: 'us-east-1' });

exports.handler = async (event: { body: string }) => {
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
      AuthFlow: 'USER_PASSWORD_AUTH',
      ClientId: clientId,
      AuthParameters: {
        USERNAME: username,
        PASSWORD: password,
      },
    };
    body.params = params;
    const data = await cognito.initiateAuth(params).promise();

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
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Credentials": true,
      },
      body: JSON.stringify(err.message),
      error: err
    };

    return response;
  }
};