import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
  CognitoIdentityProviderClient,
  AdminUpdateUserAttributesCommand
} from '@aws-sdk/client-cognito-identity-provider';
import axios from 'axios';
import { CognitoAttribute } from './authTypes';
import * as jwt from 'jsonwebtoken';

const cognito = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION });

async function updateCognitoAttributes(
  username: string,
  accessToken: string,
  refreshToken: string,
  expiresAt: number,
  refreshTokenExpiresAt: number,
  githubId: string,
  githubUsername: string
): Promise<void> {
  const attributes = [
    { Name: CognitoAttribute.GH_TOKEN, Value: accessToken },
    { Name: CognitoAttribute.GH_REFRESH_TOKEN, Value: refreshToken },
    { Name: CognitoAttribute.GH_TOKEN_EXPIRES, Value: expiresAt.toString() },
    { Name: CognitoAttribute.GH_REFRESH_EXPIRES, Value: refreshTokenExpiresAt.toString() },
    { Name: CognitoAttribute.GH_ID, Value: githubId },
    { Name: CognitoAttribute.GH_USERNAME, Value: githubUsername }
  ];

  await cognito.send(new AdminUpdateUserAttributesCommand({
    UserPoolId: process.env.COGNITO_USER_POOL_ID,
    Username: username,
    UserAttributes: attributes,
  }));
}

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
    if (!decodedState.cognitoUserId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: 'No Cognito user ID provided in state' })
      };
    }

    // Decode the JWT token to get user info
    const decodedToken = jwt.decode(decodedState.cognitoUserId);
    if (!decodedToken || typeof decodedToken === 'string') {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: 'Invalid Cognito token' })
      };
    }

    console.log('Decoded token:', decodedToken);

    // Get username from cognito:username claim
    const username = (decodedToken as any)['cognito:username'];
    if (!username) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: 'Could not determine Cognito username from token' })
      };
    }

    // GitHub OAuth token exchange
    const tokenResponse = await axios.post('https://github.com/login/oauth/access_token', {
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      code
    }, {
      headers: {
        'Accept': 'application/json'
      }
    });

    const { access_token, refresh_token, expires_in, refresh_token_expires_in } = tokenResponse.data;

    // Fetch GitHub user info
    const githubUserResponse = await axios.get('https://api.github.com/user', {
      headers: {
        'Authorization': `token ${access_token}`
      }
    });

    const githubUser = githubUserResponse.data;

    // Calculate token expiration timestamps
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = now + parseInt(expires_in);
    const refreshTokenExpiresAt = now + parseInt(refresh_token_expires_in);

    // Update Cognito user attributes with GitHub info
    await updateCognitoAttributes(
      username,
      access_token,
      refresh_token,
      expiresAt,
      refreshTokenExpiresAt,
      githubUser.id.toString(),
      githubUser.login
    );

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
      body: JSON.stringify({
        message: 'OAuth callback failed',
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    };
  }
}

// For CommonJS compatibility
module.exports = { handler };
