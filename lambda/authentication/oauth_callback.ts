import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { CognitoIdentityProviderClient, AdminUpdateUserAttributesCommand } from '@aws-sdk/client-cognito-identity-provider';
import { CognitoAttribute, GitHubToCognitoMap } from './githubUtils';

const cognito = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION });

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  let Octokit, createOAuthAppAuth;
  try {
    console.log('Attempting to import @octokit/rest');
    const OctokitModule = await import('@octokit/rest');
    Octokit = OctokitModule.Octokit;
    console.log('Successfully imported @octokit/rest');
    
    console.log('Attempting to import @octokit/auth-oauth-app');
    const AuthModule = await import('@octokit/auth-oauth-app');
    createOAuthAppAuth = AuthModule.createOAuthAppAuth;
    console.log('Successfully imported @octokit/auth-oauth-app');
  } catch (importError) {
    console.error('Error importing Octokit or createOAuthAppAuth:', importError);
    console.error('Import error details:', JSON.stringify(importError, Object.getOwnPropertyNames(importError)));
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Internal server error', 
        details: 'Failed to import required modules',
        importError: JSON.stringify(importError, Object.getOwnPropertyNames(importError))
      })
    };
  }
  console.log('OAuth callback event:', JSON.stringify(event, null, 2));
  console.log('CognitoAttribute enum values:', CognitoAttribute);
  console.log('GitHubToCognitoMap values:', GitHubToCognitoMap);
  const { code, state } = event.queryStringParameters || {};
  const cognitoUserId = state;

  console.log('Received code:', code);
  console.log('Received state:', state);

  if (!code || !cognitoUserId) {
    console.error('Missing required parameters:', { code, cognitoUserId });
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing required parameters' }) };
  }

  const requiredEnvVars = ['GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET', 'COGNITO_USER_POOL_ID', 'FRONTEND_URL'];
  const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);

  if (missingEnvVars.length > 0) {
    console.error('Missing required environment variables:', missingEnvVars);
    return { statusCode: 500, body: JSON.stringify({ error: 'Server configuration error', missingEnvVars }) };
  }

  console.log('All required environment variables are set');

  const octokit = new Octokit({
    authStrategy: createOAuthAppAuth,
    auth: {
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
    },
  });

  try {
    console.log('Starting OAuth callback process...');
    console.log('Environment:', process.env.NODE_ENV);
    console.log('Code:', code);
    console.log('Cognito User ID:', cognitoUserId);

    let authResult, user;
    if (process.env.NODE_ENV === 'test') {
      console.log('Using mock data for testing');
      // Mock data for testing
      authResult = {
        authentication: {
          type: 'token',
          tokenType: 'bearer',
          accessToken: 'mock_access_token',
        },
        token: 'mock_access_token',
        refreshToken: 'mock_refresh_token',
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
        refreshTokenExpiresAt: new Date(Date.now() + 2592000000).toISOString(),
      };
      user = {
        login: 'mock_user',
        id: 12345,
        name: 'Mock User',
        email: 'mock@example.com',
        avatar_url: 'https://example.com/avatar.png',
      };
    } else {
      // Real GitHub API calls
      console.log('Authenticating with GitHub...');
      try {
        authResult = await octokit.auth({
          type: 'oauth-user',
          code: code,
        }) as any;
        console.log("GitHub token response:", {
          access_token: authResult.token ? `${authResult.token.substring(0, 10)}...` : undefined,
          expires_in: authResult.expiresAt,
          refresh_token: authResult.refreshToken ? `${authResult.refreshToken.substring(0, 10)}...` : undefined,
          refresh_token_expires_in: authResult.refreshTokenExpiresAt,
        });
      } catch (authError) {
        console.error('Error during GitHub authentication:', authError);
        throw authError;
      }

      console.log('Fetching authenticated user data...');
      try {
        const response = await octokit.users.getAuthenticated();
        user = response.data;
        console.log('Authenticated user data:', JSON.stringify(user, null, 2));
      } catch (userError) {
        console.error('Error fetching authenticated user data:', userError);
        throw userError;
      }
    }
    console.log("GitHub user data:", {
      login: user.login,
      id: user.id,
      name: user.name,
      email: user.email,
    });

    const attributes = [
      { Name: CognitoAttribute.GH_TOKEN, Value: authResult.token },
      { Name: CognitoAttribute.GH_USERNAME, Value: user.login },
      { Name: CognitoAttribute.GH_ID, Value: user.id.toString() },
      { Name: 'name', Value: user.name || '' },
      { Name: 'email', Value: user.email || '' },
      { Name: 'picture', Value: user.avatar_url || '' },
    ];

    if (authResult.refreshToken) {
      attributes.push({ Name: GitHubToCognitoMap.refresh_token, Value: authResult.refreshToken });
    }

    if (authResult.expiresAt) {
      const expiresAt = Math.floor(new Date(authResult.expiresAt).getTime() / 1000);
      attributes.push({ Name: GitHubToCognitoMap.expires_in, Value: expiresAt.toString() });
    }

    if (authResult.refreshTokenExpiresAt) {
      const refreshTokenExpiresAt = Math.floor(new Date(authResult.refreshTokenExpiresAt).getTime() / 1000);
      attributes.push({ Name: GitHubToCognitoMap.refresh_token_expires_in, Value: refreshTokenExpiresAt.toString() });
    }

    console.log("Updating Cognito user attributes:", attributes.map(attr => 
      attr.Name.includes('token') ? { ...attr, Value: `${attr.Value.substring(0, 10)}...` } : attr
    ));

    console.log('Updating Cognito user attributes...');
    const command = new AdminUpdateUserAttributesCommand({
      UserPoolId: process.env.COGNITO_USER_POOL_ID || '',
      Username: cognitoUserId,
      UserAttributes: attributes,
    });
    await cognito.send(command);

    console.log("Cognito user attributes updated successfully");

    return {
      statusCode: 302,
      headers: {
        Location: `${process.env.FRONTEND_URL}?githubAuth=success&githubUsername=${encodeURIComponent(user.login)}`,
      },
      body: '',
    };
  } catch (error) {
    console.error('Error in OAuth callback:', error);
    let errorMessage = 'Internal server error';
    let errorDetails = 'Unknown error';
    let statusCode = 500;

    if (error instanceof Error) {
      errorMessage = error.message;
      errorDetails = error.stack || 'No stack trace available';
    }

    // Log additional information about the error
    console.error('Error type:', error instanceof Error ? error.constructor.name : typeof error);
    console.error('Error message:', errorMessage);
    console.error('Error details:', errorDetails);
    console.error('Full error object:', JSON.stringify(error, Object.getOwnPropertyNames(error)));

    return { 
      statusCode, 
      body: JSON.stringify({ 
        error: errorMessage, 
        details: errorDetails,
        errorType: error instanceof Error ? error.constructor.name : typeof error
      }) 
    };
  }
};
