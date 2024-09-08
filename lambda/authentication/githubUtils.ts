import { CognitoIdentityProviderClient } from "@aws-sdk/client-cognito-identity-provider";

const cognito = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION });

export enum CognitoAttribute {
  GH_TOKEN = 'custom:gh_token',
  GH_REFRESH_TOKEN = 'custom:gh_refresh_token',
  GH_TOKEN_EXPIRES = 'custom:gh_token_expires',
  GH_REFRESH_EXPIRES = 'custom:gh_refresh_expires',
  GH_USERNAME = 'custom:gh_username',
  GH_ID = 'custom:gh_id',
}

export const GitHubToCognitoMap = {
  access_token: CognitoAttribute.GH_TOKEN,
  refresh_token: CognitoAttribute.GH_REFRESH_TOKEN,
  expires_in: CognitoAttribute.GH_TOKEN_EXPIRES,
  refresh_token_expires_in: CognitoAttribute.GH_REFRESH_EXPIRES,
  login: CognitoAttribute.GH_USERNAME,
  id: CognitoAttribute.GH_ID,
};

export async function getValidGitHubToken(cognitoUserId: string): Promise<string> {
  console.log('githubUtils: Getting valid GitHub token for user:', cognitoUserId);
  
  const { AdminGetUserCommand } = await import("@aws-sdk/client-cognito-identity-provider");
  
  const user = await cognito.send(new AdminGetUserCommand({
    UserPoolId: process.env.COGNITO_USER_POOL_ID!,
    Username: cognitoUserId,
  }));

  const githubUsername = user.UserAttributes?.find(attr => attr.Name === 'custom:gh_username')?.Value;
  const accessToken = user.UserAttributes?.find(attr => attr.Name === 'custom:gh_token')?.Value;
  const refreshToken = user.UserAttributes?.find(attr => attr.Name === 'custom:gh_refresh_token')?.Value;
  const expiresAt = parseInt(user.UserAttributes?.find(attr => attr.Name === 'custom:gh_token_expires')?.Value || '0', 10);
  const refreshTokenExpiresAt = parseInt(user.UserAttributes?.find(attr => attr.Name === 'custom:gh_refresh_expires')?.Value || '0', 10);

  console.log('Parsed token info:', { 
    githubUsername,
    accessToken: accessToken?.substring(0, 10), 
    refreshToken: refreshToken?.substring(0, 10), 
    expiresAt, 
    refreshTokenExpiresAt 
  });

  if (githubUsername && (!accessToken || !refreshToken || !expiresAt || !refreshTokenExpiresAt)) {
    console.log('User has GitHub username but missing token information. Attempting to fetch and update.');
    return await fetchAndUpdateGitHubData(cognitoUserId, githubUsername);
  }

  if (!accessToken || !refreshToken) {
    console.error('GitHub tokens not found');
    throw new Error('GitHub tokens not found');
  }

  const now = Math.floor(Date.now() / 1000);
  console.log('Current time:', now);

  if (now < expiresAt) {
    console.log('Access token is still valid');
    return accessToken;
  }

  if (now >= refreshTokenExpiresAt) {
    console.error('GitHub refresh token has expired');
    throw new Error('GitHub refresh token has expired. User needs to re-authenticate.');
  }

  console.log('Token is expired, attempting to refresh');
  const { Octokit } = await import('@octokit/rest');
  const { createOAuthAppAuth } = await import('@octokit/auth-oauth-app');

  const octokit = new Octokit({
    authStrategy: createOAuthAppAuth,
    auth: {
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      clientType: 'oauth-app',
    },
  });

  try {
    console.log('Calling GitHub API to refresh token');
    const authResult = await octokit.auth({
      type: 'refresh',
      refreshToken: refreshToken,
    }) as any;
    console.log('GitHub token refresh result:', authResult);

    if (!authResult.access_token) {
      console.error('No access token in refresh response:', authResult);
      throw new Error('No access token in refresh response');
    }

    const { access_token, expires_in, refresh_token, refresh_token_expires_in } = authResult;
    const now = Math.floor(Date.now() / 1000);
    const newExpiresAt = now + expires_in;
    const newRefreshTokenExpiresAt = now + refresh_token_expires_in;

    console.log('Updating Cognito user attributes with new token info');
    await updateCognitoAttributes(cognitoUserId, access_token, refresh_token, newExpiresAt, newRefreshTokenExpiresAt);

    console.log('Token refresh successful');
    return access_token;
  } catch (error) {
    console.error('Error refreshing GitHub token:', error);
    if (error instanceof Error && error.message.includes('bad_refresh_token')) {
      throw new Error('GitHub refresh token is invalid or expired. User needs to re-authenticate.');
    }
    throw new Error('Failed to refresh GitHub token');
  }
}

async function fetchAndUpdateGitHubData(cognitoUserId: string, githubUsername: string): Promise<string> {
  const { Octokit } = await import('@octokit/rest');
  const { createOAuthAppAuth } = await import('@octokit/auth-oauth-app');

  const octokit = new Octokit({
    authStrategy: createOAuthAppAuth,
    auth: {
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      clientType: 'oauth-app',
    },
  });

  try {
    const { data: user } = await octokit.users.getByUsername({ username: githubUsername });

    // We can't get the user's email or create tokens without proper authentication
    console.log('Fetched GitHub user data:', user);

    // Since we can't create real tokens, we'll use placeholder values
    const now = Math.floor(Date.now() / 1000);
    const placeholderToken = 'placeholder_token';
    const placeholderRefreshToken = 'placeholder_refresh_token';
    const placeholderExpiresAt = now + 3600; // 1 hour from now
    const placeholderRefreshTokenExpiresAt = now + 30 * 24 * 3600; // 30 days from now

    await updateCognitoAttributes(
      cognitoUserId,
      placeholderToken,
      placeholderRefreshToken,
      placeholderExpiresAt,
      placeholderRefreshTokenExpiresAt,
      user.id.toString(),
      user.login
    );

    console.log('Updated Cognito user attributes with GitHub data');
    throw new Error('GitHub re-authentication required');
  } catch (error) {
    console.error('Error fetching and updating GitHub data:', error);
    throw new Error('Failed to fetch and update GitHub data');
  }
}

async function updateCognitoAttributes(
  cognitoUserId: string,
  accessToken: string,
  refreshToken: string,
  expiresAt: number,
  refreshTokenExpiresAt: number,
  githubId?: string,
  githubUsername?: string
) {
  console.log('Updating Cognito attributes:', {
    cognitoUserId,
    accessToken: accessToken.substring(0, 10) + '...',
    refreshToken: refreshToken.substring(0, 10) + '...',
    expiresAt,
    refreshTokenExpiresAt,
    githubId,
    githubUsername
  });
  const { AdminUpdateUserAttributesCommand } = await import("@aws-sdk/client-cognito-identity-provider");
  
  const attributes = [
    { Name: 'custom:gh_token', Value: accessToken },
    { Name: 'custom:gh_refresh_token', Value: refreshToken },
    { Name: 'custom:gh_token_expires', Value: expiresAt.toString() },
    { Name: 'custom:gh_refresh_expires', Value: refreshTokenExpiresAt.toString() },
  ];

  if (githubId) {
    attributes.push({ Name: 'custom:gh_id', Value: githubId });
  }

  if (githubUsername) {
    attributes.push({ Name: 'custom:gh_username', Value: githubUsername });
  }

  await cognito.send(new AdminUpdateUserAttributesCommand({
    UserPoolId: process.env.COGNITO_USER_POOL_ID!,
    Username: cognitoUserId,
    UserAttributes: attributes,
  }));
}
