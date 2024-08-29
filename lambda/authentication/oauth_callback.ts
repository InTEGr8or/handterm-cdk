import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { request } from 'https';
import { CognitoIdentityProviderClient, AdminUpdateUserAttributesCommand, AdminCreateUserCommand, AdminSetUserPasswordCommand, AdminGetUserCommand } from '@aws-sdk/client-cognito-identity-provider';

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
    if (!cognitoUserId && githubUser.email) {
      // If not logged in, try to find the user by email
      try {
        const getUserResponse = await cognito.send(new AdminGetUserCommand({
          UserPoolId: userPoolId,
          Username: githubUser.email,
        }));
        cognitoUserId = getUserResponse.Username;
      } catch (error) {
        console.log('User not found in Cognito');
      }
    }

    if (!cognitoUserId && githubUser.email) {
      console.log('Creating new Cognito user');
      // Create a new user if not found and GitHub provided an email
      const createUserResponse = await cognito.send(new AdminCreateUserCommand({
        UserPoolId: userPoolId,
        Username: githubUser.email,
        UserAttributes: [
          { Name: 'email', Value: githubUser.email },
          { Name: 'email_verified', Value: 'true' },
        ],
      }));
      cognitoUserId = createUserResponse.User?.Username;

      // Set a temporary password for the new user
      await cognito.send(new AdminSetUserPasswordCommand({
        UserPoolId: userPoolId,
        Username: cognitoUserId!,
        Password: 'TemporaryPassword123!', // This should be changed by the user on first login
        Permanent: true,
      }));
    }

    if (!cognitoUserId) {
      return errorResponse(400, 'Unable to create or find Cognito user.');
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
      // Use the email from the user data if available
      primaryEmail = userData.email;
    }
  } catch (error) {
    console.error('Error fetching email data:', error);
    // Use the email from the user data if available
    primaryEmail = userData.email;
  }

  return {
    id: userData.id.toString(),
    login: userData.login,
    email: primaryEmail || `${userData.login}@example.com`,
  };
}

function errorResponse(statusCode: number, message: string): APIGatewayProxyResult {
  return {
    statusCode,
    body: JSON.stringify({ message }),
  };
}

