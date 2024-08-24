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

    // Create or update Cognito user
    const cognito = new CognitoIdentityServiceProvider();
    const userPoolId = process.env.COGNITO_USER_POOL_ID!;

    let cognitoUser;
    let username = githubUser.email || `github_${githubUser.id}`;
    try {
      cognitoUser = await cognito.adminGetUser({
        UserPoolId: userPoolId,
        Username: username,
      }).promise();

      // Update GitHub token and other attributes
      await cognito.adminUpdateUserAttributes({
        UserPoolId: userPoolId,
        Username: username,
        UserAttributes: [
          { Name: 'email', Value: githubUser.email },
          { Name: 'preferred_username', Value: githubUser.login },
          { Name: 'custom:github_id', Value: githubUser.id.toString() },
          { Name: 'custom:github_token', Value: tokenData.access_token },
        ],
      }).promise();
    } catch (error) {
      // User doesn't exist, create a new one
      cognitoUser = await cognito.adminCreateUser({
        UserPoolId: userPoolId,
        Username: username,
        UserAttributes: [
          { Name: 'email', Value: githubUser.email },
          { Name: 'preferred_username', Value: githubUser.login },
          { Name: 'custom:github_id', Value: githubUser.id.toString() },
          { Name: 'custom:github_token', Value: tokenData.access_token },
        ],
      }).promise();
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'GitHub account linked successfully',
        userId: githubUser.id,
      }),
    };
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
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.github.com',
      path: '/user',
      method: 'GET',
      headers: {
        'Authorization': `token ${accessToken}`,
        'User-Agent': 'AWS Lambda',
      },
    };

    const req = request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        const user = JSON.parse(body);
        resolve({
          id: user.id.toString(),
          login: user.login,
          email: user.email,
        });
      });
    });

    req.on('error', (e) => {
      reject(e);
    });

    req.end();
  });
}
