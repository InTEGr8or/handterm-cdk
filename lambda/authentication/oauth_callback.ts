import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { CognitoIdentityProviderClient, AdminCreateUserCommand } from '@aws-sdk/client-cognito-identity-provider';
import axios from 'axios';

const cognitoClient = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION });

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const { code } = event.queryStringParameters || {};

    if (!code) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: 'No authorization code provided' })
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

    // Create or update user in Cognito
    const createUserParams = {
      UserPoolId: process.env.COGNITO_USER_POOL_ID,
      Username: githubUser.login,
      UserAttributes: [
        { Name: 'email', Value: githubUser.email || '' },
        { Name: 'name', Value: githubUser.name || '' },
        { Name: 'custom:gh_id', Value: githubUser.id.toString() },
        { Name: 'custom:gh_username', Value: githubUser.login },
        { Name: 'custom:gh_token', Value: access_token }
      ]
    };

    try {
      await cognitoClient.send(new AdminCreateUserCommand(createUserParams));
    } catch (createError: any) {
      // If user already exists, update attributes instead
      if (createError.name === 'UsernameExistsException') {
        // Update user attributes logic would go here
        console.log('User already exists, updating attributes');
      } else {
        throw createError;
      }
    }

    // Redirect to frontend with success
    return {
      statusCode: 302,
      headers: {
        'Location': `${process.env.API_URL}?githubLogin=success`
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
