import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  console.log('githubAuthRedirect Event:', JSON.stringify(event, null, 2));

  const clientId = process.env.GITHUB_CLIENT_ID;
  const redirectUri = `${process.env.REDIRECT_URI}`;

  if (!clientId || !redirectUri) {
    console.error('Missing environment variables:', { clientId, redirectUri });
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: 'GitHub client ID or redirect URI is not set.',
      }),
    };
  }

  const refererUrl = event.headers.referer || 'https://handterm.com';

  // Extract Cognito user ID from the Authorization header if it exists
  let cognitoUserId: string | null = null;
  const authHeader = event.headers.Authorization || event.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    // In a real scenario, you'd validate the token and extract the user ID
    // For now, we'll just set a placeholder value
    cognitoUserId = 'placeholder-user-id';
  }

  const state = Buffer.from(JSON.stringify({
    timestamp: Date.now(),
    refererUrl: encodeURIComponent(refererUrl),
    cognitoUserId: cognitoUserId,
  })).toString('base64');

  console.log('State before encoding:', JSON.stringify({
    timestamp: Date.now(),
    refererUrl: encodeURIComponent(refererUrl),
    redirectUri: redirectUri,
    cognitoUserId: cognitoUserId,
  }, null, 2));
  console.log('Encoded state:', state);

  const githubAuthUrl =
    `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=read:user,user:email&state=${state}`;

  console.log('Redirecting to:', githubAuthUrl, redirectUri);

  return {
    statusCode: 302,
    headers: {
      Location: githubAuthUrl,
    },
    body: '',
  };
};
