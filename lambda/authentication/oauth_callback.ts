import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { request } from 'https';
import { CognitoIdentityProviderClient, AdminUpdateUserAttributesCommand, AdminCreateUserCommand, AdminSetUserPasswordCommand, AdminGetUserCommand, ListUsersCommand } from '@aws-sdk/client-cognito-identity-provider';

/* AUTHENTICATION WORKFLOW
  1. If the user is already authenticated with Cognito, attach the oauth account to the current user.
  2. If the user is not authenticated, AND the oauth account provides an email address, create a new user in Cognito using the provided email.
  3. If the user is not authenticated, AND the oauth account does not provide an email address, return an error message to the user about the missing email.
  4. Do not create a fake email address. If you find yourself creating a fake email address, you should consider that a sign that you have misunderstood the previous three points and you should re-read them.
*/

interface TokenData {
  access_token?: string;
  error?: string;
}

interface GitHubUser {
  id: string;
  login: string;
  name?: string;
  avatar_url?: string;
  gravatar_id?: string;
  gists_url?: string;
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
      return errorResponse(400, `Failed to exchange authorization code for access token: ${tokenData.error}`);
    }

    if (!tokenData.access_token) {
      console.error('No access token received from GitHub');
      return errorResponse(400, 'No access token received from GitHub');
    }

    const githubUser = await getGitHubUser(tokenData.access_token);
    console.log('GitHub user data:', JSON.stringify(githubUser));

    const cognito = new CognitoIdentityProviderClient();
    const userPoolId = process.env.COGNITO_USER_POOL_ID!;

    // Check if the user is already logged in to Cognito
    let cognitoUserId = decodedState.cognitoUserId;
    
    if (cognitoUserId) {
      // User is authenticated, attach GitHub account to current user
      try {
        console.log('Updating user attributes for existing user:', cognitoUserId);
        console.log('GitHub ID:', githubUser.id.toString());
        console.log('GitHub Token:', tokenData.access_token);
        
        const updateResult = await cognito.send(new AdminUpdateUserAttributesCommand({
          UserPoolId: userPoolId,
          Username: cognitoUserId,
          UserAttributes: [
            { Name: 'custom:github_id', Value: githubUser.id.toString() },
            { Name: 'custom:github_token', Value: tokenData.access_token },
          ],
        }));
        
        console.log('Update result:', JSON.stringify(updateResult, null, 2));
        console.log('GitHub account attached to existing user');
        
        // Verify the update
        const verifyUser = await cognito.send(new AdminGetUserCommand({
          UserPoolId: userPoolId,
          Username: cognitoUserId,
        }));
        console.log('User after update:', JSON.stringify(verifyUser, null, 2));
      } catch (error) {
        console.error('Error attaching GitHub account to existing user:', error);
        return errorResponse(500, 'Failed to attach GitHub account to existing user');
      }
    } else {
      // User is not authenticated, check if a user with this GitHub ID already exists
      try {
        const listUsersResponse = await cognito.send(new ListUsersCommand({
          UserPoolId: userPoolId,
          Filter: `custom:github_id = "${githubUser.id}"`,
        }));

        if (listUsersResponse.Users && listUsersResponse.Users.length > 0) {
          // User with this GitHub ID already exists, update their attributes
          cognitoUserId = listUsersResponse.Users[0].Username;
          await cognito.send(new AdminUpdateUserAttributesCommand({
            UserPoolId: userPoolId,
            Username: cognitoUserId!,
            UserAttributes: [
              { Name: 'custom:github_token', Value: tokenData.access_token },
            ],
          }));
          console.log('Existing user updated with new GitHub token');
        } else {
          // No user with this GitHub ID exists, create a new user
          if (!githubUser.email) {
            return errorResponse(400, 'GitHub account does not provide an email address. Unable to create a new user.');
          }

          const createUserResponse = await cognito.send(new AdminCreateUserCommand({
            UserPoolId: userPoolId,
            Username: githubUser.email,
            UserAttributes: [
              { Name: 'email', Value: githubUser.email },
              { Name: 'email_verified', Value: 'true' },
              { Name: 'custom:github_id', Value: githubUser.id.toString() },
              { Name: 'custom:github_token', Value: tokenData.access_token },
            ],
            MessageAction: 'SUPPRESS',
          }));
          cognitoUserId = createUserResponse.User?.Username;
          console.log('New user created:', cognitoUserId);

          // Set a temporary password for the new user
          await cognito.send(new AdminSetUserPasswordCommand({
            UserPoolId: userPoolId,
            Username: cognitoUserId!,
            Password: generateTemporaryPassword(),
            Permanent: false,
          }));
        }
      } catch (error) {
        console.error('Error handling user:', error);
        return errorResponse(500, 'Failed to handle user');
      }
    }

    // Fetch the updated user data
    const updatedUserResponse = await cognito.send(new AdminGetUserCommand({
      UserPoolId: userPoolId,
      Username: cognitoUserId,
    }));
    console.log('Updated user data:', JSON.stringify(updatedUserResponse, null, 2));

    const refererUrl = decodeURIComponent(decodedState.refererUrl) || 'https://handterm.com';
    const githubUsername = githubUser.login;

    return {
      statusCode: 302,
      headers: {
        'Location': `${refererUrl}?githubAuth=success&githubUsername=${encodeURIComponent(githubUsername)}`,
      },
      body: JSON.stringify({
        message: 'GitHub account linked successfully. Redirecting...',
        userId: cognitoUserId,
      }),
    };
  } catch (error) {
    console.error('Unhandled error in OAuth callback:', error);
    return errorResponse(500, 'An unexpected error occurred while handling the OAuth callback.');
  }
};

import { DescribeUserPoolCommand } from '@aws-sdk/client-cognito-identity-provider';

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
        console.log('GitHub token response:', body);
        resolve(JSON.parse(body) as TokenData);
      });
    });

    req.on('error', (e) => {
      console.error('Error in getGitHubToken:', e);
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

  // First, get the user data
  const userData = await new Promise<any>((resolve, reject) => {
    const req = request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => { 
        console.log('Raw user data:', body);
        resolve(JSON.parse(body)); 
      });
    });
    req.on('error', (e) => { 
      console.error('Error fetching GitHub user data:', e);
      reject(e); 
    });
    req.end();
  });

  // Then, get the user's email
  const emailOptions = {
    ...options,
    path: '/user/emails',
  };

  let primaryEmail: string | undefined;
  try {
    const emailData = await new Promise<any>((resolve, reject) => {
      const req = request(emailOptions, (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => { 
          console.log('Raw email data:', body);
          resolve(JSON.parse(body)); 
        });
      });
      req.on('error', (e) => { 
        console.error('Error fetching GitHub email data:', e);
        reject(e); 
      });
      req.end();
    });

    console.log('Parsed user data:', JSON.stringify(userData));
    console.log('Parsed email data:', JSON.stringify(emailData));

    if (Array.isArray(emailData)) {
      primaryEmail = emailData.find(email => email.primary)?.email || emailData[0]?.email;
    } else {
      console.log('Email data is not an array:', typeof emailData);
    }
  } catch (error) {
    console.error('Error fetching email data:', error);
  }

  return {
    id: userData.id.toString(),
    login: userData.login,
    email: primaryEmail,
  };
}

function errorResponse(statusCode: number, message: string): APIGatewayProxyResult {
  return {
    statusCode,
    body: JSON.stringify({ message }),
  };
}


function generateTemporaryPassword(): string {
  return Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-8).toUpperCase() + '!';
}
