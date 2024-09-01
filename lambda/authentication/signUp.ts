// cdk/lambda/authentication/signUp.ts

import { CognitoIdentityProviderClient, SignUpCommand } from "@aws-sdk/client-cognito-identity-provider";

const cognito = new CognitoIdentityProviderClient({ region: 'us-east-1' });

export const handler = async (event: { body: string; }) => {
  console.log('Signup received event:', event); // Log the incoming event

  const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;

  try {
    // Check if event.body is a string and parse it, otherwise, use it directly
    const { username, password, email } = body;

    console.log(`Processing signUp for username: ${username}`); // Log the extracted username
    const clientId = process.env.COGNITO_APP_CLIENT_ID;
    if (!clientId) {
      throw new Error('COGNITO_APP_CLIENT_ID environment variable is not set.');
    }
    var params = {
      ClientId: clientId,
      Username: username,
      Password: password,
      UserAttributes: [
        {
          Name: 'email',
          Value: email
        },
      ],
    };
    const command = new SignUpCommand(params);
    const data = await cognito.send(command);
    console.log('SignUp success:', JSON.stringify(data)); // Log successful signup
    
    // Extract the verification code from the response
    const verificationCode = data.CodeDeliveryDetails?.AttributeName === 'email' 
      ? 'Check your email for the verification code'
      : 'Verification code sent';

    // Include CORS headers and verification code in the successful response
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*", // Adjust this value based on your requirements
        "Access-Control-Allow-Credentials": true, // If your client needs to handle cookies
      },
      body: JSON.stringify({
        message: 'User signed up successfully',
        verificationCode: verificationCode,
        username: username
      })
    };
  } catch (err: any) {
    console.error('SignUp error:', err); // Log any errors that occur
    // Include CORS headers in the error response
    return {
      statusCode: 400,
      headers: {
        "Access-Control-Allow-Origin": "*", // Adjust this value based on your requirements
        "Access-Control-Allow-Credentials": true, // If your client needs to handle cookies
      },
      body: JSON.stringify({ error: err.message })
    };
  }
};
