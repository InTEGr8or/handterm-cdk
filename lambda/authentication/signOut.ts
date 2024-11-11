import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { CognitoIdentityProviderClient, GlobalSignOutCommand } from '@aws-sdk/client-cognito-identity-provider';

const cognitoClient = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION });

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  console.log('SignOut request received:', event);

  try {
    const accessToken = event.headers?.Authorization?.split(' ')[1];

    if (!accessToken) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: 'No access token provided' })
      };
    }

    const command = new GlobalSignOutCommand({ AccessToken: accessToken });
    await cognitoClient.send(command);

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Successfully signed out' })
    };
  } catch (error) {
    console.error('SignOut error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Failed to sign out' })
    };
  }
}

// For CommonJS compatibility
module.exports = { handler };
