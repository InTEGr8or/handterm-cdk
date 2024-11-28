import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  if (!event.queryStringParameters) {
    return { statusCode: 401, body: '' };
  }
  const state = event.queryStringParameters["state"] || '';

  // Use Buffer.from instead of atob
  let decodedState;
  try {
    decodedState = JSON.parse(Buffer.from(state, 'base64').toString('utf-8'));
    console.log('githubAuthRedirect decoded state:', decodedState);
  } catch (error) {
    console.error('Error decoding state:', error);
    return {
      statusCode: 400,
      body: JSON.stringify({ message: 'Invalid state parameter' })
    };
  }

  const clientId = process.env.GITHUB_CLIENT_ID;  // Use OAuth App client ID, not GitHub App ID
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

  // Add repo scope to match CDK stack configuration
  const githubAuthUrl =
    `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=repo,read:user,user:email&state=${encodeURIComponent(state)}`;

  console.log('Redirecting to:', githubAuthUrl);

  return {
    statusCode: 302,
    headers: {
      Location: githubAuthUrl,
    },
    body: '',
  };
};
