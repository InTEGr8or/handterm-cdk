import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { Octokit } from '@octokit/rest';
import { createOAuthAppAuth } from '@octokit/auth-oauth-app';
import { CognitoIdentityServiceProvider } from 'aws-sdk';
import { CognitoAttribute, GitHubToCognitoMap } from './githubUtils';

const cognito = new CognitoIdentityServiceProvider();

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  console.log('CognitoAttribute enum values:', CognitoAttribute);
  console.log('GitHubToCognitoMap values:', GitHubToCognitoMap);
  const { code, state } = event.queryStringParameters || {};
  const cognitoUserId = state;

  if (!code || !cognitoUserId) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing required parameters' }) };
  }

  const octokit = new Octokit({
    authStrategy: createOAuthAppAuth,
    auth: {
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    },
  });

  try {
    const authResult = await octokit.auth({
      type: 'oauth-user',
      code: code,
    }) as any;
    console.log("GitHub token response:", {
      access_token: authResult.access_token ? `${authResult.access_token.substring(0, 10)}...` : undefined,
      expires_in: authResult.expires_in,
      refresh_token: authResult.refresh_token ? `${authResult.refresh_token.substring(0, 10)}...` : undefined,
      refresh_token_expires_in: authResult.refresh_token_expires_in,
      token_type: authResult.token_type,
      scope: authResult.scope
    });

    const { access_token, refresh_token, expires_in, refresh_token_expires_in } = authResult;

    const { data: user } = await octokit.users.getAuthenticated();
    console.log("GitHub user data:", {
      login: user.login,
      id: user.id,
      name: user.name,
      email: user.email,
    });

    const now = Math.floor(Date.now() / 1000);
    const attributes = [
      { Name: CognitoAttribute.GH_TOKEN, Value: access_token },
      { Name: CognitoAttribute.GH_USERNAME, Value: user.login },
      { Name: CognitoAttribute.GH_ID, Value: user.id.toString() },
      { Name: 'name', Value: user.name || '' },
      { Name: 'email', Value: user.email || '' },
      { Name: 'picture', Value: user.avatar_url || '' },
    ];

    if (refresh_token) {
      attributes.push({ Name: GitHubToCognitoMap.refresh_token, Value: refresh_token });
    }

    if (expires_in) {
      const expiresAt = now + expires_in;
      attributes.push({ Name: GitHubToCognitoMap.expires_in, Value: expiresAt.toString() });
    }

    if (refresh_token_expires_in) {
      const refreshTokenExpiresAt = now + refresh_token_expires_in;
      attributes.push({ Name: GitHubToCognitoMap.refresh_token_expires_in, Value: refreshTokenExpiresAt.toString() });
    }

    console.log("Updating Cognito user attributes:", attributes.map(attr => 
      attr.Name.includes('token') ? { ...attr, Value: `${attr.Value.substring(0, 10)}...` } : attr
    ));

    await cognito.adminUpdateUserAttributes({
      UserPoolId: process.env.COGNITO_USER_POOL_ID!,
      Username: cognitoUserId,
      UserAttributes: attributes,
    }).promise();

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
    return { statusCode: 500, body: JSON.stringify({ error: 'Internal server error' }) };
  }
};
