// cdk/lambda/authentication/refreshSession.ts
import * as AWS from 'aws-sdk';
const cognito = new AWS.CognitoIdentityServiceProvider({ region: 'us-east-1' });

exports.handler = async (event: { body: string }) => {
  const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
  console.log('RefreshSession body:', body);

  try {
    const { refreshToken } = body;
    // Ensure ClientId is a string and not undefined
    const clientId = process.env.COGNITO_APP_CLIENT_ID;
    if (!clientId) {
      throw new Error('COGNITO_APP_CLIENT_ID environment variable is not set.');
    }
    if (!refreshToken) {
      throw new Error('Refresh token is required.');
    }

    const params = {
      AuthFlow: 'REFRESH_TOKEN_AUTH',
      ClientId: clientId,
      AuthParameters: {
        REFRESH_TOKEN: refreshToken,
      },
    };

    const data = await cognito.initiateAuth(params).promise();

    console.log('RefreshSession success:', JSON.stringify(data));

    const { IdToken, AccessToken } = data.AuthenticationResult ?? {};

    if (!IdToken || !AccessToken) {
      // Handle the missing tokens scenario
      return {
        statusCode: 400,
        body: JSON.stringify({ message: "Token refresh failed or incomplete." }),
      };
    }

    // Return the new tokens to the client
    const response = {
      statusCode: 200,
      body: JSON.stringify({
        IdToken,
        AccessToken,
      }),
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Credentials": true,
      },
    };
    return response;
  } catch (err: any) {
    console.error('RefreshSession error:', err);
    const response = {
      statusCode: 500,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Credentials": true,
      },
      body: JSON.stringify({ message: err.message || 'An error occurred during the token refresh process.' }),
    };

    return response;
  }
};