import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { CognitoIdentityProviderClient, AdminUpdateUserAttributesCommand } from '@aws-sdk/client-cognito-identity-provider';
import { CognitoAttribute, GitHubToCognitoMap } from './githubUtils';

const cognito = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION });

import { Octokit } from '@octokit/rest';
import { createOAuthAppAuth } from '@octokit/auth-oauth-app';

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

    try {
      console.log('Starting OAuth callback process...');
      console.log('Environment:', process.env.NODE_ENV);
      console.log('Code:', code);
      console.log('Cognito User ID:', cognitoUserId);

      let authResult: CreateTokenResponse;
      let user: any;

      if (process.env.NODE_ENV === 'test') {
        console.log('Using mock data for testing');
        authResult = {
          token: 'gho_mock_access_token',
          type: 'oauth',
          tokenType: 'bearer',
          refreshToken: 'ghr_mock_refresh_token',
          refreshTokenExpiresAt: new Date(Date.now() + 15811200000).toISOString(),
          expiresAt: new Date(Date.now() + 28800000).toISOString(),
        };

        user = {
          login: 'testuser',
          id: 12345,
          name: 'Test User',
          email: 'test@example.com',
          avatar_url: 'https://example.com/avatar.png'
        };
      } else {
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
