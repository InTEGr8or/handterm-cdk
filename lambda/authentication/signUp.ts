// cdk/lambda/authentication/signUp.ts

import * as AWS from 'aws-sdk';

const cognito = new AWS.CognitoIdentityServiceProvider({ region: 'us-east-1' });

exports.handler = async (event: { body: string; }) => {
  console.log('Signup received event:', event); // Log the incoming event

  const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;

  try {
    // Check if event.body is a string and parse it, otherwise, use it directly
    const { username, password, email } = body;

    console.log(`Processing signUp for username: ${body}`); // Log the extracted variables
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
    body.params = params;
    const data = await cognito.signUp(params).promise();
    console.log('SignUp success:', JSON.stringify(data)); // Log successful signup
    // Include CORS headers in the successful response
    return {
      statusCode: 200,
      body: JSON.stringify(data)
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
      body: JSON.stringify({ error: err.message, request: body })
    };
  }
};