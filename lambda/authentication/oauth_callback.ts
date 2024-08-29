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

async function isUserAuthenticated(decodedState: any): Promise<boolean> {
  return !!decodedState.cognitoUserId;
}

async function getGitHubUserData(accessToken: string): Promise<GitHubUser> {
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

  console.log('Parsed user data:', JSON.stringify(userData));

  return {
    id: userData.id.toString(),
    login: userData.login,
    email: userData.email,
  };
}

async function getGitHubEmail(accessToken: string): Promise<string | undefined> {
  // Then, get the user's email
  const emailOptions = {
    hostname: 'api.github.com',
    method: 'GET',
    headers: {
      'Authorization': `token ${accessToken}`,
      'User-Agent': 'AWS Lambda',
      'Accept': 'application/vnd.github.v3+json',
    },
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

    console.log('Parsed email data:', JSON.stringify(emailData));

    if (Array.isArray(emailData)) {
      primaryEmail = emailData.find(email => email.primary)?.email || emailData[0]?.email;
    } else {
      console.log('Email data is not an array:', typeof emailData);
    }
  } catch (error) {
    console.error('Error fetching email data:', error);
  }
  return primaryEmail;
}

async function attachGitHubAccountToUser(cognitoUserId: string, githubUser: GitHubUser, accessToken: string): Promise<void> {
  const cognito = new CognitoIdentityProviderClient();
  const userPoolId = process.env.COGNITO_USER_POOL_ID!;

  await cognito.send(new AdminUpdateUserAttributesCommand({
    UserPoolId: userPoolId,
    Username: cognitoUserId,
    UserAttributes: [
      { Name: 'custom:github_id', Value: githubUser.id.toString() },
      { Name: 'custom:github_token', Value: accessToken },
    ],
  }));
}

async function createNewUser(githubUser: GitHubUser, accessToken: string): Promise<string> {
  const cognito = new CognitoIdentityProviderClient();
  const userPoolId = process.env.COGNITO_USER_POOL_ID!;

  const createUserResponse = await cognito.send(new AdminCreateUserCommand({
    UserPoolId: userPoolId,
    Username: githubUser.email!,
    UserAttributes: [
      { Name: 'email', Value: githubUser.email! },
      { Name: 'email_verified', Value: 'true' },
      { Name: 'custom:github_id', Value: githubUser.id.toString() },
      { Name: 'custom:github_token', Value: accessToken },
    ],
    MessageAction: 'SUPPRESS',
  }));

  const cognitoUserId = createUserResponse.User?.Username!;

  await cognito.send(new AdminSetUserPasswordCommand({
    UserPoolId: userPoolId,
    Username: cognitoUserId,
    Password: generateTemporaryPassword(),
    Permanent: false,
  }));

  return cognitoUserId;
}

async function handleExistingGitHubUser(githubId: string, accessToken: string): Promise<string | null> {
  const cognito = new CognitoIdentityProviderClient();
  const userPoolId = process.env.COGNITO_USER_POOL_ID!;

  const listUsersResponse = await cognito.send(new ListUsersCommand({
    UserPoolId: userPoolId,
    Filter: `custom:github_id = "${githubId}"`,
  }));

  if (listUsersResponse.Users && listUsersResponse.Users.length > 0) {
    const existingUser = listUsersResponse.Users[0];
    await cognito.send(new AdminUpdateUserAttributesCommand({
      UserPoolId: userPoolId,
      Username: existingUser.Username!,
      UserAttributes: [
        { Name: 'custom:github_token', Value: accessToken },
      ],
    }));
    return existingUser.Username!;
  }

  return null;
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

    const githubUser = await getGitHubUserData(tokenData.access_token);
    console.log('GitHub user data:', JSON.stringify(githubUser));

    const isAuthenticated = await isUserAuthenticated(decodedState);
    const githubEmail = getGitHubEmail(tokenData.access_token);

    let cognitoUserId: string;

    if (isAuthenticated) {
      console.log('EXISTING COGNITO USER WORKFLOW.');
      await attachGitHubAccountToUser(decodedState.cognitoUserId, githubUser, tokenData.access_token);
      cognitoUserId = decodedState.cognitoUserId;
    } else {
      console.log('NEW COGNITO USER WORKFLOW.');
      if (!githubEmail) {
        console.log('NO GITHUB EMAIL PROVIDED. ABORTIN COGNITO USER CREATIONK.');
        return errorResponse(400, 'GitHub account does not provide an email address. Unable to create a new user.');
      }

      const existingUser = await handleExistingGitHubUser(githubUser.id, tokenData.access_token);
      if (existingUser) {
        cognitoUserId = existingUser;
      } else {
        cognitoUserId = await createNewUser(githubUser, tokenData.access_token);
      }
    }

    // Fetch the updated user data
    const cognito = new CognitoIdentityProviderClient();
    const userPoolId = process.env.COGNITO_USER_POOL_ID!;
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


function errorResponse(statusCode: number, message: string): APIGatewayProxyResult {
  return {
    statusCode,
    body: JSON.stringify({ message }),
  };
}


function generateTemporaryPassword(): string {
  return Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-8).toUpperCase() + '!';
}
