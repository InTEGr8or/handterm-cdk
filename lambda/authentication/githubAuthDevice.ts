import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import axios from 'axios';

interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    // Step 1: Request device and user codes
    const deviceCodeResponse = await axios.post(
      'https://github.com/login/device/code',
      {
        client_id: process.env.GITHUB_CLIENT_ID,
        scope: 'repo read:user user:email'
      },
      {
        headers: {
          'Accept': 'application/json'
        }
      }
    );

    const deviceData = deviceCodeResponse.data as DeviceCodeResponse;

    // Step 2: Return the verification info to the client
    return {
      statusCode: 200,
      body: JSON.stringify({
        device_code: deviceData.device_code,
        user_code: deviceData.user_code,
        verification_uri: deviceData.verification_uri,
        expires_in: deviceData.expires_in,
        interval: deviceData.interval
      })
    };

  } catch (error) {
    console.error('Device code request error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: 'Failed to initiate device flow',
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    };
  }
};
