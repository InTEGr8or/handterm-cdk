import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import axios from 'axios';
import {
  CognitoIdentityProviderClient,
  AdminGetUserCommand,
  AdminUpdateUserAttributesCommand
} from "@aws-sdk/client-cognito-identity-provider";
import { CognitoAttribute } from './authTypes';

const cognito = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION });

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  console.log('Full event received:', JSON.stringify(event, null, 2));

  try {
    const { device_code } = JSON.parse(event.body || '{}');

    if (!device_code) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: 'Device code is required' })
      };
    }

    // Detailed logging for request context
    console.log('Request Context:', JSON.stringify(event.requestContext, null, 2));
    console.log('Authorizer Lambda:', JSON.stringify(event.requestContext?.authorizer?.lambda, null, 2));

    // Extract username from the authorizer
    const username = event.requestContext?.authorizer?.lambda?.userId;
    console.log('Extracted Username:', username);

    if (!username) {
      return {
        statusCode: 401,
        body: JSON.stringify({
          message: 'Unauthorized: No username found',
          details: {
            requestContext: !!event.requestContext,
            authorizerLambda: !!event.requestContext?.authorizer?.lambda,
            userId: event.requestContext?.authorizer?.lambda?.userId
          }
        })
      };
    }

    // Retrieve the user's details
    let userDetails;
    try {
      userDetails = await cognito.send(new AdminGetUserCommand({
        UserPoolId: process.env.COGNITO_USER_POOL_ID,
        Username: username
      }));

      console.log('User Details:', JSON.stringify(userDetails, null, 2));
    } catch (getUserError) {
      console.error('Error retrieving user:', getUserError);
      return {
        statusCode: 500,
        body: JSON.stringify({
          message: 'Failed to retrieve user information',
          error: getUserError instanceof Error ? getUserError.message : 'Unknown error'
        })
      };
    }

    // Extract Cognito user ID (sub)
    const cognitoUserId = userDetails.UserAttributes?.find(attr => attr.Name === 'sub')?.Value;
    console.log('Retrieved Cognito User ID:', cognitoUserId);

    if (!cognitoUserId) {
      return {
        statusCode: 401,
        body: JSON.stringify({ message: 'Unable to find Cognito user ID' })
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
    console.log('Full Token Response Data:', JSON.stringify(tokenData, null, 2));

    // If we got an access token, auth is complete
    if (tokenData.access_token) {
      console.log("TokenData:", tokenData);

      // Fetch additional user info from GitHub
      const userResponse = await axios.get('https://api.github.com/user', {
        headers: {
          'Authorization': `token ${tokenData.access_token}`
        }
      });

      const githubUser = userResponse.data;

      // Set token expiration to 14 days from now
      // Note: We'll need to handle token refresh/re-authentication when this expires
      const tokenExpiration = Math.floor(Date.now() / 1000) + (14 * 24 * 60 * 60); // 14 days in seconds

      // Prepare Cognito attributes to update
      const attributes = [
        { Name: CognitoAttribute.GH_TOKEN, Value: tokenData.access_token },
        { Name: CognitoAttribute.GH_TOKEN_EXPIRES, Value: tokenExpiration.toString() },
        { Name: CognitoAttribute.GH_USERNAME, Value: githubUser.login },
        { Name: CognitoAttribute.GH_ID, Value: githubUser.id.toString() }
      ];

      console.log("Username for update:", username);
      console.log("Attributes:", attributes);
      console.log("UserPoolId:", process.env.COGNITO_USER_POOL_ID);

      try {
        // Update Cognito user attributes using the original username
        const cognitoResult = await cognito.send(new AdminUpdateUserAttributesCommand({
          UserPoolId: process.env.COGNITO_USER_POOL_ID,
          Username: username, // Use the original username from the authorizer
          UserAttributes: attributes
        }));
        console.log("CognitoResult:", cognitoResult);
      } catch (cognitoError) {
        console.error('Cognito Update Error:', cognitoError);
        return {
          statusCode: 500,
          body: JSON.stringify({
            message: 'Failed to update Cognito attributes',
            error: cognitoError instanceof Error ? cognitoError.message : 'Unknown Cognito error'
          })
        };
      }

      return {
        statusCode: 200,
        body: JSON.stringify({
          status: 'complete',
          access_token: tokenData.access_token,
          token_type: tokenData.token_type,
          scope: tokenData.scope,
          username: githubUser.login
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
