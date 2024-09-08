// cdk/lambda/authentication/changePassword.ts

import { CognitoIdentityProviderClient, ChangePasswordCommand } from '@aws-sdk/client-cognito-identity-provider';

const cognito = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION });

export const handler = async (event: { body: string }) => {
  const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
  try {
    const { accessToken, previousPassword, proposedPassword } = body;
    const params = {
      AccessToken: accessToken, // The current user's access token
      PreviousPassword: previousPassword,
      ProposedPassword: proposedPassword,
    };

    const command = new ChangePasswordCommand(params);
    const data = await cognito.send(command);
    console.log('ChangePassword success:', JSON.stringify(data));
    return {
      statusCode: 200,
      headers: {
        "Set-Cookie": `accessToken=${accessToken}; HttpOnly; Secure; Path=/;`,
      },
      body: JSON.stringify({ message: 'Password changed successfully' }),
    };
  } catch (err: any) {
    console.error('ChangePassword error:', err);
    return {
      statusCode: 400,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Credentials": true,
      },
      body: JSON.stringify(err.message),
    };
  }
};
