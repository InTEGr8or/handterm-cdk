import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { request } from 'https';
import { CognitoIdentityProviderClient, AdminUpdateUserAttributesCommand, AdminGetUserCommand, AdminCreateUserCommand } from '@aws-sdk/client-cognito-identity-provider';

interface TokenData {
  access_token?: string;
  error?: string;
}

interface GitHubUser {
  id: string;
  login: string;
  email?: string;
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  console.log('OAuth callback received:', JSON.stringify(event, null, 2));

  try {
    const code = event.queryStringParameters?.code;
    const state = event.queryStringParameters?.state;

    if (!code || !state) {
      return errorResponse(400, 'Authorization code or state is missing.');
    }

    const clientId = process.env.GITHUB_CLIENT_ID;
    const clientSecret = process.env.GITHUB_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      console.error('Missing environment variables:', { clientId, clientSecret });
      return errorResponse(500, 'GitHub client ID or client secret is not set.');
    }

    let decodedState;
    try {
      decodedState = JSON.parse(Buffer.from(state, 'base64').toString('utf-8'));
    } catch (error) {
      console.error('Error decoding state:', error);
      return errorResponse(400, 'Invalid state parameter.');
    }

    console.log('Decoded state:', decodedState);

    const tokenData = await getGitHubToken(code, clientId, clientSecret);

    if (tokenData.error) {
      console.error('Error getting GitHub token:', tokenData.error);
      return errorResponse(400, 'Failed to exchange authorization code for access token.');
    }

    const githubUser = await getGitHubUser(tokenData.access_token!);
    console.log('GitHub user data:', JSON.stringify(githubUser));

    const cognito = new CognitoIdentityProviderClient();
    const userPoolId = process.env.COGNITO_USER_POOL_ID!;

    let cognitoUserId = decodedState.cognitoUserId;
    let isNewUser = false;

    if (!cognitoUserId) {
      // User is not logged in, check if they exist in Cognito
      try {
        const userResponse = await cognito.send(new AdminGetUserCommand({
          UserPoolId: userPoolId,
          Username: githubUser.id.toString(),
        }));
        cognitoUserId = userResponse.Username;
      } catch (error) {
        console.log('User not found in Cognito, attempting to create');
        // User doesn't exist, create a new one with GitHub ID as username
        try {
          const createUserResponse = await cognito.send(new AdminCreateUserCommand({
            UserPoolId: userPoolId,
            Username: githubUser.id.toString(),
            UserAttributes: [
              { Name: 'custom:github_id', Value: githubUser.id.toString() },
            ],
          }));
          cognitoUserId = createUserResponse.User?.Username;
          isNewUser = true;
        } catch (createError) {
          console.error('Error creating user:', createError);
          return errorResponse(500, 'Failed to create new user in Cognito.');
        }
      }
    }

    if (!cognitoUserId) {
      return errorResponse(500, 'Failed to get or create Cognito user.');
    }

    // Update the user attributes
    await cognito.send(new AdminUpdateUserAttributesCommand({
      UserPoolId: userPoolId,
      Username: cognitoUserId,
      UserAttributes: [
        { Name: 'custom:github_id', Value: githubUser.id.toString() },
        { Name: 'custom:github_token', Value: tokenData.access_token },
      ],
    }));
    console.log('User attributes updated successfully');

    // Construct the redirect URL
    const redirectUrl = decodedState.redirectUrl || 'https://handterm.com';
    const redirectUrlWithParams = new URL(redirectUrl);
    redirectUrlWithParams.searchParams.append('githubLinked', 'true');
    if (isNewUser) {
      redirectUrlWithParams.searchParams.append('newUser', 'true');
    }

    return {
      statusCode: 302,
      headers: {
        Location: redirectUrlWithParams.toString(),
      },
      body: JSON.stringify({
        message: 'GitHub account linked successfully',
        isNewUser: isNewUser,
      }),
    };
  } catch (error) {
    console.error('Unhandled error in OAuth callback:', error);
    return errorResponse(500, 'An unexpected error occurred while handling the OAuth callback.');
  }
};

async function getGitHubToken(code: string, clientId: string, clientSecret: string): Promise<TokenData> {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code: code,
    });

    const options = {
      hostname: 'github.com',
      path: '/login/oauth/access_token',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Content-Length': data.length,
      },
    };

    const req = request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        resolve(JSON.parse(body) as TokenData);
      });
    });

    req.on('error', (e) => {
      reject(e);
    });

    req.write(data);
    req.end();
  });
}

async function getGitHubUser(accessToken: string): Promise<GitHubUser> {
  const options = {
    hostname: 'api.github.com',
    path: '/user',
    method: 'GET',
    headers: {
      'Authorization': `token ${accessToken}`,
      'User-Agent': 'AWS Lambda',
      'Accept': 'application/vnd.github.v3+json',
    },
  };

  return new Promise<GitHubUser>((resolve, reject) => {
    const req = request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => { 
        const userData = JSON.parse(body);
        resolve({
          id: userData.id.toString(),
          login: userData.login,
          email: userData.email,
        });
      });
    });
    req.on('error', (e) => { reject(e); });
    req.end();
  });
}

function errorResponse(statusCode: number, message: string): APIGatewayProxyResult {
  return {
    statusCode,
    body: JSON.stringify({ message }),
  };
}

