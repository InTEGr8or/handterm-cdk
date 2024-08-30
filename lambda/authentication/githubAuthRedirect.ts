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
  
  // We're not expecting an Authorization header at this point
  console.log('No Authorization header expected for GitHub auth redirect');
  const cognitoUserId = null;

  const state = Buffer.from(JSON.stringify({
    timestamp: Date.now(),
    refererUrl: encodeURIComponent(refererUrl),
    cognitoUserId: cognitoUserId || null,
  })).toString('base64');

  console.log('State before encoding:', JSON.stringify({
    timestamp: Date.now(),
    refererUrl: encodeURIComponent(refererUrl),
    cognitoUserId: cognitoUserId || null,
  }, null, 2));
  console.log('Encoded state:', state);
  console.log('Authorization header:', authHeader);
  console.log('Cognito User ID:', cognitoUserId);

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
