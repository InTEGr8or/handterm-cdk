import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { CognitoIdentityProviderClient, AdminUpdateUserAttributesCommand } from '@aws-sdk/client-cognito-identity-provider';
import axios from 'axios';

const cognitoClient = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION });

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const { code, state } = event.queryStringParameters || {};

    if (!code) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: 'No authorization code provided' })
      };
    }
    if (!state) {
      return {
        statusCode: 404,
        body: JSON.stringify({
          message: 'No `state` property passed back to callback'
        })
      }
    }

    let decodedState;
    try {
      decodedState = JSON.parse(Buffer.from(state, 'base64').toString('utf-8'));
    } catch (error) {
      console.error('Error decoding state:', error);
      return {statusCode: 400, body: JSON.stringify({message: 'Invalid state parameter.'})};
    }
    console.log('Decoded state:', decodedState);

    // Verify the Cognito token from state
    if (!decodedState.cognitoToken) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: 'No Cognito token provided in state' })
      };
    }

    // GitHub OAuth token exchange logic
    const tokenResponse = await axios.post('https://github.com/login/oauth/access_token', {
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      code
    }, {
      headers: {
        'Accept': 'application/json'
      }
    });

    const { access_token } = tokenResponse.data;

    // Fetch GitHub user info
    const userResponse = await axios.get('https://api.github.com/user', {
      headers: {
        'Authorization': `token ${access_token}`
      }
    });

    const githubUser = userResponse.data;

    // Get user info from Cognito token
    const userInfo = await axios.get(`${process.env.API_BASE_URL}/getUser`, {
      headers: {
        'Authorization': `Bearer ${decodedState.cognitoToken}`
      }
    });

    const username = userInfo.data.Username;

    // Update existing Cognito user with GitHub attributes
    const updateParams = {
      UserPoolId: process.env.COGNITO_USER_POOL_ID,
      Username: username,
      UserAttributes: [
        { Name: 'custom:gh_id', Value: githubUser.id.toString() },
        { Name: 'custom:gh_username', Value: githubUser.login },
        { Name: 'custom:gh_token', Value: access_token }
      ]
    };

    await cognitoClient.send(new AdminUpdateUserAttributesCommand(updateParams));

    const refererUrl = decodeURIComponent(decodedState.refererUrl) || 'https://handterm.com';

    // Redirect to frontend with success
    return {
      statusCode: 302,
      headers: {
        'Location': `${refererUrl}?githubLogin=success&githubUsername=${githubUser.login}`
      },
      body: ''
    };

  } catch (error) {
    console.error('OAuth Callback Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'OAuth callback failed' })
    };
  }
}

// For CommonJS compatibility
module.exports = { handler };
