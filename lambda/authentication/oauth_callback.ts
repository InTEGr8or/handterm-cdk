import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { request } from 'https';
import { CognitoIdentityServiceProvider } from 'aws-sdk';

interface TokenData {
  access_token?: string;
  error?: string;
}

interface GitHubUser {
  id: string;
  login: string;
  email: string;
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  console.log('OAuth callback received:', event);

  const code = event.queryStringParameters?.code;
  const cognitoAuthToken = event.headers['Authorization'];

  if (!code) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        message: 'Authorization code is missing.',
      }),
    };
  }

  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: 'GitHub client ID or client secret is not set.',
      }),
    };
  }

  try {
    const tokenData = await getGitHubToken(code, clientId, clientSecret);

    if (tokenData.error) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          message: 'Failed to exchange authorization code for access token.',
          error: tokenData.error,
        }),
      };
    }

    const githubUser = await getGitHubUser(tokenData.access_token!);
    console.log('GitHub user data:', JSON.stringify(githubUser));

    // Create or update Cognito user
    const cognito = new CognitoIdentityServiceProvider();
    const userPoolId = process.env.COGNITO_USER_POOL_ID!;

    let cognitoUser;
    if (cognitoAuthToken) {
      // User is already logged in, link GitHub account
      try {
        const cognitoUserInfo = await cognito.getUser({ AccessToken: cognitoAuthToken.split(' ')[1] }).promise();
        await cognito.adminUpdateUserAttributes({
          UserPoolId: userPoolId,
          Username: cognitoUserInfo.Username,
          UserAttributes: [
            { Name: 'custom:github_id', Value: githubUser.id.toString() },
            { Name: 'custom:github_token', Value: tokenData.access_token },
          ],
        }).promise();

        return {
          statusCode: 200,
          body: JSON.stringify({
            message: 'GitHub account linked successfully',
            userId: cognitoUserInfo.Username,
          }),
        };
      } catch (error) {
        console.error('Error linking GitHub account:', error);
        return {
          statusCode: 500,
          body: JSON.stringify({
            message: 'Failed to link GitHub account',
            error: (error as Error).message,
          }),
        };
      }
    } else if (githubUser.email && githubUser.email !== `github_${githubUser.id}@example.com`) {
      // GitHub account exposes email, we can create or update a Cognito user
      try {
        cognitoUser = await cognito.adminGetUser({
          UserPoolId: userPoolId,
          Username: githubUser.email,
        }).promise();

        // Update GitHub token and other attributes
        await cognito.adminUpdateUserAttributes({
          UserPoolId: userPoolId,
          Username: githubUser.email,
          UserAttributes: [
            { Name: 'email', Value: githubUser.email },
            { Name: 'preferred_username', Value: githubUser.login },
            { Name: 'custom:github_id', Value: githubUser.id.toString() },
            { Name: 'custom:github_token', Value: tokenData.access_token },
          ],
        }).promise();

        return {
          statusCode: 200,
          body: JSON.stringify({
            message: 'GitHub account linked successfully',
            userId: githubUser.id,
          }),
        };
      } catch (error) {
        // User doesn't exist, create a new one
        cognitoUser = await cognito.adminCreateUser({
          UserPoolId: userPoolId,
          Username: githubUser.email,
          UserAttributes: [
            { Name: 'email', Value: githubUser.email },
            { Name: 'preferred_username', Value: githubUser.login },
            { Name: 'custom:github_id', Value: githubUser.id.toString() },
            { Name: 'custom:github_token', Value: tokenData.access_token },
          ],
        }).promise();

        return {
          statusCode: 200,
          body: JSON.stringify({
            message: 'New Cognito user created and GitHub account linked successfully',
            userId: githubUser.id,
          }),
        };
      }
    } else {
      // GitHub account doesn't expose email, we can't create a new Cognito user
      return {
        statusCode: 400,
        body: JSON.stringify({
          message: 'Unable to link GitHub account. Please sign in to your Cognito account first and then link your GitHub account.',
          userId: githubUser.id,
        }),
      };
    }
  } catch (error: unknown) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: 'An error occurred while handling the OAuth callback.',
        error: (error as Error).message,
      }),
    };
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
    req.on('error', (e) => { reject(e); });
    req.end();
  });

  // Then, get the user's email
  const emailOptions = {
    ...options,
    path: '/user/emails',
  };

  const emailData = await new Promise<any>((resolve, reject) => {
    const req = request(emailOptions, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => { 
        console.log('Raw email data:', body);
        resolve(JSON.parse(body)); 
      });
    });
    req.on('error', (e) => { reject(e); });
    req.end();
  });

  console.log('Parsed user data:', JSON.stringify(userData));
  console.log('Parsed email data:', JSON.stringify(emailData));

  let primaryEmail = '';
  if (Array.isArray(emailData)) {
    primaryEmail = emailData.find(email => email.primary)?.email || emailData[0]?.email;
  } else {
    console.log('Email data is not an array:', typeof emailData);
  }

  return {
    id: userData.id.toString(),
    login: userData.login,
    email: primaryEmail || `github_${userData.id}@example.com`,
  };
}
