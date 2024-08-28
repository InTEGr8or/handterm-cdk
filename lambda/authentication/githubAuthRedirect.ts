import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

export const handler = async (event: APIGatewayProxyEvent):
  Promise<APIGatewayProxyResult> => {
  console.log('Event:', JSON.stringify(event, null, 2));

  const clientId = process.env.GITHUB_CLIENT_ID;
  const redirectUri = process.env.REDIRECT_URI;

  if (!clientId || !redirectUri) {
    console.error('Missing environment variables:', {
      clientId, redirectUri
    });
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: 'GitHub client ID or redirect URI is not set.',
      }),
    };
  }

  const refererUrl = event.headers.referer || 'https://handterm.com';
  const state = Buffer.from(JSON.stringify({
    timestamp: Date.now(),
    refererUrl: encodeURIComponent(refererUrl),
  })).toString('base64');

  const githubAuthUrl =
    `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=read:user,user:email&state=${state}`;

  console.log('Redirecting to:', githubAuthUrl);

  return {
    statusCode: 302,
    headers: {
      Location: githubAuthUrl,
    },
    body: '',
  };
};
