import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import axios from 'axios';

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const { device_code } = JSON.parse(event.body || '{}');

    if (!device_code) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: 'Device code is required' })
      };
    }

    // Check the authorization status
    const tokenResponse = await axios.post(
      'https://github.com/login/oauth/access_token',
      {
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        device_code,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
      },
      {
        headers: {
          'Accept': 'application/json'
        }
      }
    );

    const tokenData = tokenResponse.data;

    // If we got an access token, auth is complete
    if (tokenData.access_token) {
      console.log("TokenData:", tokenData);
      return {
        statusCode: 200,
        body: JSON.stringify({
          status: 'complete',
          access_token: tokenData.access_token,
          token_type: tokenData.token_type,
          scope: tokenData.scope
        })
      };
    }

    // If still waiting, return appropriate status
    if (tokenData.error === 'authorization_pending') {
      return {
        statusCode: 202,
        body: JSON.stringify({
          status: 'pending',
          message: 'Waiting for user to authorize'
        })
      };
    }

    // Handle other errors
    return {
      statusCode: 400,
      body: JSON.stringify({
        status: 'error',
        error: tokenData.error,
        error_description: tokenData.error_description
      })
    };

  } catch (error) {
    console.error('Poll status error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: 'Failed to check authorization status',
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    };
  }
};
