// cdk/lambda/authentication/signUp.ts

import { CognitoIdentityProviderClient, SignUpCommand } from "@aws-sdk/client-cognito-identity-provider";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

const cognito = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION });

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  console.log('SignUp handler called');
  console.log('Signup received event:', event); // Log the incoming event

  if (!event.body) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: 'Invalid request body' })
    };
  }

  const body = JSON.parse(event.body);

  try {
    const { username, password, email } = body;

    console.log(`Processing signUp for username: ${username}`); // Log the extracted username
    const clientId = process.env.COGNITO_APP_CLIENT_ID;
    if (!clientId) {
      throw new Error('COGNITO_APP_CLIENT_ID environment variable is not set.');
    }
    const params = {
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
    
    let statusCode = 400;
    let errorMessage = 'An error occurred during sign up';
    let errorCode = 'UnknownError';

    if (err.name === 'InvalidPasswordException') {
      errorMessage = 'Password does not meet the requirements';
      errorCode = 'InvalidPassword';
    } else if (err.name === 'UsernameExistsException') {
      errorMessage = 'An account with this username already exists';
      errorCode = 'UsernameExists';
    } else if (err.name === 'InvalidParameterException') {
      errorMessage = 'Invalid parameter provided';
      errorCode = 'InvalidParameter';
    }

    // Include CORS headers in the error response
    return {
      statusCode: statusCode,
      headers: {
        "Access-Control-Allow-Origin": "*", // Adjust this value based on your requirements
        "Access-Control-Allow-Credentials": true, // If your client needs to handle cookies
      },
      body: JSON.stringify({
        error: errorMessage,
        errorCode: errorCode,
        details: err.message
      })
    };
  }
};
