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
  email?: string;
}

async function isUserAuthenticated(decodedState: any): Promise<boolean> {
  console.log('Checking user authentication. Decoded state:', JSON.stringify(decodedState));
  if (!decodedState || !decodedState.cognitoUserId) {
    console.log('No Cognito User ID in state, user is not authenticated');
    return false;
  }
  
  // Verify if the user exists in Cognito
  const cognito = new CognitoIdentityProviderClient();
  const userPoolId = process.env.COGNITO_USER_POOL_ID!;
  
  try {
    await cognito.send(new AdminGetUserCommand({
      UserPoolId: userPoolId,
      Username: decodedState.cognitoUserId,
    }));
    console.log('User is authenticated with Cognito User ID:', decodedState.cognitoUserId);
    return true;
  } catch (error) {
    console.log('User not found in Cognito:', error);
    return false;
  }
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

  console.log('Parsed user data:', userData);
  console.log('All GitHub user properties:', Object.keys(userData));

  return {
    id: userData.id.toString(),
    login: userData.login,
    name: userData.name,
    email: userData.email,
  };
}

async function getGitHubEmail(githubUser: GitHubUser): Promise<string | undefined> {
  console.log('GitHub user data in getGitHubEmail:', JSON.stringify(githubUser, null, 2));
  if (githubUser.email) {
    console.log('Email found in user data:', githubUser.email);
    return githubUser.email;
  }

  console.log('Email not found in user data, unable to retrieve email');
  return undefined;
}

async function attachGitHubAccountToUser(cognitoUserId: string, githubUser: GitHubUser, accessToken: string): Promise<void> {
  console.log('attachGitHubAccountToUser function called');
  const cognito = new CognitoIdentityProviderClient();
  const userPoolId = process.env.COGNITO_USER_POOL_ID!;
  const githubUserId = githubUser.id.toString();
  console.log('Attaching GitHub user ID:', githubUserId, 'to Cognito user ID:', cognitoUserId);
  const userAttributes = [
    { Name: 'custom:github_id', Value: githubUserId },
    { Name: 'custom:github_token', Value: accessToken },
    { Name: 'custom:github_username', Value: githubUser.login },
  ];

  if (githubUser.name) {
    userAttributes.push({ Name: 'name', Value: githubUser.name });
  }

  if (githubUser.email) {
    userAttributes.push({ Name: 'email', Value: githubUser.email });
    userAttributes.push({ Name: 'email_verified', Value: 'true' });
  }

  const updateAttributes = {
    UserPoolId: userPoolId,
    Username: cognitoUserId,
    UserAttributes: userAttributes,
  };
  console.log('Updating user attributes:', JSON.stringify(updateAttributes, null, 2));
  await cognito.send(new AdminUpdateUserAttributesCommand(updateAttributes));
}

async function createNewUser(githubUser: GitHubUser, accessToken: string): Promise<string> {
  const cognito = new CognitoIdentityProviderClient();
  const userPoolId = process.env.COGNITO_USER_POOL_ID!;

  const userAttributes = [
    { Name: 'email', Value: githubUser.email! },
    { Name: 'email_verified', Value: 'true' },
    { Name: 'custom:github_id', Value: githubUser.id.toString() },
    { Name: 'custom:github_token', Value: accessToken },
    { Name: 'custom:github_username', Value: githubUser.login },
  ];

  if (githubUser.name) {
    userAttributes.push({ Name: 'name', Value: githubUser.name });
  }

  const createUserResponse = await cognito.send(new AdminCreateUserCommand({
    UserPoolId: userPoolId,
    Username: githubUser.email!,
    UserAttributes: userAttributes,
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

  try {
    console.log(`Searching for user with GitHub ID: ${githubId}`);
    const listUsersResponse = await cognito.send(new ListUsersCommand({
      UserPoolId: userPoolId,
      Filter: `custom:github_id = "${githubId}"`,
      Limit: 1,  // We only need one user
    }));

    console.log('ListUsersCommand response:', JSON.stringify(listUsersResponse, null, 2));

    if (listUsersResponse.Users && listUsersResponse.Users.length > 0) {
      const existingUser = listUsersResponse.Users[0];
      const updateAttributes = {
        UserPoolId: userPoolId,
        Username: existingUser.Username!,
        UserAttributes: [
          { Name: 'custom:github_token', Value: accessToken },
        ],
      };
      console.log('Updating user attributes:', JSON.stringify(updateAttributes, null, 2));
      
      try {
        await cognito.send(new AdminUpdateUserAttributesCommand(updateAttributes));
        console.log('User attributes updated successfully');
      } catch (updateError) {
        console.error('Error updating user attributes:', updateError);
        throw updateError;
      }
      
      return existingUser.Username!;
    } else {
      console.log('No existing user found with the given GitHub ID');
    }
  } catch (error) {
    console.error('Error in handleExistingGitHubUser:', error);
    if (error instanceof Error) {
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
    }
    // Instead of throwing, we'll return null
    return null;
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

    console.log('Decoded state:', JSON.stringify(decodedState));
    const isAuthenticated = await isUserAuthenticated(decodedState);
    console.log('Is user authenticated:', isAuthenticated);
    
    const githubEmail = await getGitHubEmail(githubUser);
    console.log('GitHub email:', githubEmail);

    let cognitoUserId: string;

    let existingUser: string | null = null;
    try {
      existingUser = await handleExistingGitHubUser(githubUser.id, tokenData.access_token);
      console.log('Existing user:', existingUser);
    } catch (error) {
      console.error('Error handling existing GitHub user:', error);
      return errorResponse(500, 'An error occurred while processing your GitHub account.');
    }
    
    if (isAuthenticated) {
      console.log('EXISTING COGNITO USER WORKFLOW. CognitoUserId:', decodedState.cognitoUserId);
      cognitoUserId = decodedState.cognitoUserId;
      if (existingUser && existingUser !== cognitoUserId) {
        // GitHub account is already linked to a different Cognito user
        return errorResponse(400, 'This GitHub account is already linked to a different user.');
      }
      try {
        console.log('Attempting to attach GitHub account to user:', cognitoUserId);
        await attachGitHubAccountToUser(cognitoUserId, githubUser, tokenData.access_token);
        console.log('GitHub account attached to user:', cognitoUserId);
      } catch (error) {
        console.error('Error attaching GitHub account to user:', error);
        return errorResponse(500, 'An error occurred while linking your GitHub account.');
      }
    } else if (existingUser) {
      console.log('EXISTING GITHUB USER WORKFLOW. CognitoUserId:', existingUser);
      cognitoUserId = existingUser;
    } else {
      console.log('NEW COGNITO USER WORKFLOW.');
      if (!githubEmail) {
        console.log('NO GITHUB EMAIL PROVIDED. RETURNING ERROR MESSAGE.');
        return errorResponse(400, 'GitHub account does not have a public email address. Please add a public email to your GitHub account and try again.');
      }
      try {
        console.log('Attempting to create new user with email:', githubEmail);
        cognitoUserId = await createNewUser({ ...githubUser, email: githubEmail }, tokenData.access_token);
        console.log('New user created:', cognitoUserId);
      } catch (error) {
        console.error('Error creating new user:', error);
        return errorResponse(500, 'An error occurred while creating your account.');
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

    console.log('Redirecting to:', `${refererUrl}?githubAuth=success&githubUsername=${encodeURIComponent(githubUsername)}`);

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
    if (error instanceof Error) {
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
    }
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
