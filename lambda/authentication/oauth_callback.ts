import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { request } from 'https';
import { CognitoIdentityProviderClient, AdminUpdateUserAttributesCommand, AdminGetUserCommand, AdminCreateUserCommand, ListUsersCommand } from '@aws-sdk/client-cognito-identity-provider';

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

  // Check if this is a GitHub webhook event
  if (event.headers['x-github-event']) {
    console.log('Received GitHub webhook event. Ignoring.');
    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'GitHub webhook event received and ignored' }),
    };
  }

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
      // User is not logged in, check if they exist in Cognito by GitHub ID
      try {
        console.log('Searching for user with GitHub ID:', githubUser.id);
        const listUsersCommand = new ListUsersCommand({
          UserPoolId: userPoolId,
          Filter: `custom:github_id = "${githubUser.id}"`,
        });
        console.log('ListUsersCommand:', JSON.stringify(listUsersCommand, null, 2));
        
        const listUsersResponse = await cognito.send(listUsersCommand);
        if (listUsersResponse.Users && listUsersResponse.Users.length > 0) {
          cognitoUserId = listUsersResponse.Users[0].Username;
          console.log('Existing user found:', cognitoUserId);
        } else {
          console.log('User not found, creating new user');
          const email = githubUser.email || `${githubUser.login}@example.com`;
          const createUserCommand = new AdminCreateUserCommand({
            UserPoolId: userPoolId,
            Username: email,
            UserAttributes: [
              { Name: 'email', Value: email },
              { Name: 'custom:github_id', Value: githubUser.id.toString() },
            ],
          });
          console.log('AdminCreateUserCommand:', JSON.stringify(createUserCommand, null, 2));
          
          const createUserResponse = await cognito.send(createUserCommand);
          cognitoUserId = createUserResponse.User?.Username;
          isNewUser = true;
          console.log('New user created:', cognitoUserId);
        }
      } catch (error) {
        console.error('Error finding or creating user:', error);
        if (error instanceof Error) {
          console.error('Error name:', error.name);
          console.error('Error message:', error.message);
          console.error('Error stack:', error.stack);
        }
        return errorResponse(500, 'Failed to find or create user in Cognito.');
      }
    }

    if (!cognitoUserId) {
      return errorResponse(500, 'Failed to get or create Cognito user.');
    }

    // Update the user attributes
    try {
      await cognito.send(new AdminUpdateUserAttributesCommand({
        UserPoolId: userPoolId,
        Username: cognitoUserId,
        UserAttributes: [
          { Name: 'custom:github_id', Value: githubUser.id.toString() },
          { Name: 'custom:github_token', Value: tokenData.access_token },
        ],
      }));
    } catch (error) {
      console.error('Error updating user attributes:', error);
      return errorResponse(500, 'Failed to update user attributes in Cognito.');
    }
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
      res.on('end', async () => { 
        const userData = JSON.parse(body);
        let email = userData.email;
        
        // If email is not public, fetch it separately
        if (!email) {
          email = await getGitHubUserEmail(accessToken);
        }
        
        resolve({
          id: userData.id.toString(),
          login: userData.login,
          email: email,
        });
      });
    });
    req.on('error', (e) => { reject(e); });
    req.end();
  });
}

async function getGitHubUserEmail(accessToken: string): Promise<string | undefined> {
  const options = {
    hostname: 'api.github.com',
    path: '/user/emails',
    method: 'GET',
    headers: {
      'Authorization': `token ${accessToken}`,
      'User-Agent': 'AWS Lambda',
      'Accept': 'application/vnd.github.v3+json',
    },
  };

  return new Promise<string | undefined>((resolve, reject) => {
    const req = request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => { 
        const emails = JSON.parse(body);
        const primaryEmail = emails.find((email: any) => email.primary);
        resolve(primaryEmail ? primaryEmail.email : undefined);
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

