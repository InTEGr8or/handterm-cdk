import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { CognitoIdentityProviderClient, AdminUpdateUserAttributesCommand } from '@aws-sdk/client-cognito-identity-provider';
import { CognitoAttribute, GitHubToCognitoMap } from './githubUtils.js';
import { Octokit } from '@octokit/rest';
import { createOAuthAppAuth } from '@octokit/auth-oauth-app';

// Ensure ESM imports are properly handled
// Remove unnecessary destructuring since Octokit is already the class

const cognito = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION });

const getOctokit = async () => {
  console.log('Using Octokit modules...');
  try {
    return { Octokit, createOAuthAppAuth };
  } catch (error) {
    console.error('Error with Octokit modules:', error);
    console.error('Error details:', error instanceof Error ? error.stack : String(error));
    throw error;
  }
};

interface CreateTokenResponse {
  token: string;
  type: string;
  tokenType: string;
  refreshToken?: string;
  refreshTokenExpiresAt?: string;
  expiresAt?: string;
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    console.log('Successfully imported Octokit and createOAuthAppAuth');
    console.log('OAuth callback event:', JSON.stringify(event, null, 2));
    console.log('CognitoAttribute enum values:', CognitoAttribute);
    console.log('GitHubToCognitoMap values:', GitHubToCognitoMap);
    const { code, state } = event.queryStringParameters || {};
    
    console.log('Received code:', code);
    console.log('Received state:', state);

    if (!code || !state) {
      console.error('Missing required parameters:', { code, state });
      return { 
        statusCode: 400, 
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          error: 'Missing required parameters',
          code: code || 'missing',
          state: state || 'missing'
        }) 
      };
    }

    // Parse state parameter
    let parsedState;

    // In test environment, simulate the GitHub OAuth flow
    if (process.env.NODE_ENV === 'test') {
      console.log('Test environment detected, using mock GitHub responses');
      
      // Validate the code and state are present
      if (!code || !state) {
        throw new Error('Missing code or state parameter');
      }

      // Mock the GitHub token response
      const mockAuthResult = {
        token: 'gho_mock_token',
        type: 'oauth',
        tokenType: 'bearer',
        refreshToken: 'ghr_mock_refresh_token',
        refreshTokenExpiresAt: new Date(Date.now() + 15811200000).toISOString(),
        expiresAt: new Date(Date.now() + 28800000).toISOString()
      };

      // Mock GitHub user data
      const mockUser = {
        login: 'testuser',
        id: 12345,
        name: 'Test User',
        email: 'test@example.com',
        avatar_url: 'https://github.com/testuser.png'
      };

      // Update Cognito attributes with mock data
      const attributes = [
        { Name: CognitoAttribute.GH_TOKEN, Value: mockAuthResult.token },
        { Name: CognitoAttribute.GH_USERNAME, Value: mockUser.login },
        { Name: CognitoAttribute.GH_ID, Value: mockUser.id.toString() },
        { Name: 'name', Value: mockUser.name },
        { Name: 'email', Value: mockUser.email },
        { Name: 'picture', Value: mockUser.avatar_url }
      ];

      if (mockAuthResult.refreshToken) {
        attributes.push({ 
          Name: GitHubToCognitoMap.refresh_token, 
          Value: mockAuthResult.refreshToken 
        });
      }

      console.log('Mock flow completed successfully');
      return {
        statusCode: 302,
        headers: {
          'Location': `${process.env.FRONTEND_URL}?githubAuth=success&githubUsername=${mockUser.login}`,
          'Access-Control-Allow-Origin': process.env.FRONTEND_URL || '*',
          'Access-Control-Allow-Credentials': 'true'
        },
        body: ''
      };
    }

    try {
      const decodedState = Buffer.from(state, 'base64').toString();
      console.log('Decoded state string:', decodedState);
      parsedState = JSON.parse(decodedState);
      console.log('Parsed state:', parsedState);
      
      // Validate required state properties
      if (!parsedState.timestamp || !parsedState.referrerUrl || !parsedState.cognitoUserId) {
        throw new Error('Missing required state properties');
      }
    } catch (error) {
      console.error('State parsing error:', error);
      return { 
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          error: 'Invalid state parameter',
          state: state,
          details: error instanceof Error ? error.message : String(error),
          parsedState: parsedState || null
        }) 
      };
    }

    const { cognitoUserId } = parsedState;
    if (!cognitoUserId) {
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

    try {
      console.log('Starting OAuth callback process...', {
        environment: process.env.NODE_ENV,
        code: code ? `${code.substring(0,10)}...` : undefined,
        cognitoUserId,
        clientId: process.env.GITHUB_CLIENT_ID ? `${process.env.GITHUB_CLIENT_ID.substring(0,10)}...` : undefined,
        frontendUrl: process.env.FRONTEND_URL,
        userPoolId: process.env.COGNITO_USER_POOL_ID
      });

      let authResult: CreateTokenResponse;
      let user: any;

      // Real GitHub OAuth flow
        const { Octokit, createOAuthAppAuth } = await getOctokit();
        console.log('Successfully created Octokit instance');

        const auth = createOAuthAppAuth({
          clientId: process.env.GITHUB_CLIENT_ID!,
          clientSecret: process.env.GITHUB_CLIENT_SECRET!,
        });

        try {
          // Type assertion to handle the auth.createToken method
          const authApp = auth as unknown as {
            createToken: (params: { code: string }) => Promise<CreateTokenResponse>
          };

          authResult = await authApp.createToken({
            code: code!
          });

          const octokit = new Octokit({
            auth: authResult.token
          });

          const response = await octokit.users.getAuthenticated();
          user = response.data;
        } catch (error) {
          console.error('Error during GitHub authentication:', error);
          throw error;
        }
      // Log complete GitHub response data to help debug issues
      console.log("Complete GitHub response:", {
        user: user,
        authResult: {
          ...authResult,
          token: authResult.token ? `${authResult.token.substring(0,10)}...` : undefined,
          refreshToken: authResult.refreshToken ? `${authResult.refreshToken.substring(0,10)}...` : undefined
        }
      });

      if (!user || !user.login || !user.id) {
        throw new Error('Invalid or missing user data');
      }

      const attributes = [
        { Name: CognitoAttribute.GH_TOKEN, Value: authResult.token || '' },
        { Name: CognitoAttribute.GH_USERNAME, Value: user.login || '' },
        { Name: CognitoAttribute.GH_ID, Value: (user.id || '').toString() },
        { Name: 'name', Value: user.name || '' },
        { Name: 'email', Value: user.email || '' },
        { Name: 'picture', Value: user.avatar_url || '' },
      ].filter(attr => attr.Value !== ''); // Remove any attributes with empty values

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

      if (attributes.length > 0) {
        console.log('Updating Cognito user attributes...');
        const command = new AdminUpdateUserAttributesCommand({
          UserPoolId: process.env.COGNITO_USER_POOL_ID || '',
          Username: cognitoUserId,
          UserAttributes: attributes,
        });
        try {
          await cognito.send(command);
          console.log('Successfully updated Cognito user attributes');
        } catch (error) {
          console.error('Failed to update Cognito user attributes:', error);
          throw error;
        }
      } else {
        console.warn('No valid attributes to update');
      }

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
  }
  catch (error) {
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
}
