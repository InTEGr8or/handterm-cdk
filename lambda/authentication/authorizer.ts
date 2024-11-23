import { APIGatewayTokenAuthorizerEvent, APIGatewayAuthorizerResult } from 'aws-lambda';
import { CognitoJwtVerifier } from 'aws-jwt-verify';
import { CognitoIdentityProviderClient, GetUserCommand } from '@aws-sdk/client-cognito-identity-provider';

interface CognitoVerifyResult {
  sub: string;
  token_use: string;
  scope: string;
  auth_time: number;
  iss: string;
  exp: number;
  iat: number;
  client_id: string;
  username: string;
}

const generatePolicy = (principalId: string, effect: 'Allow' | 'Deny', resource: string, context?: Record<string, any>): APIGatewayAuthorizerResult => ({
  principalId,
  policyDocument: {
    Version: '2012-10-17',
    Statement: [
      {
        Action: 'execute-api:Invoke',
        Effect: effect,
        Resource: resource,
      },
    ],
  },
  context,
});

export async function handler(event: APIGatewayTokenAuthorizerEvent): Promise<APIGatewayAuthorizerResult> {
  console.log('Auth token:', event.authorizationToken);
  console.log('Method ARN:', event.methodArn);

  if (!event.authorizationToken) {
    throw new Error('Unauthorized');
  }

  const token = event.authorizationToken.replace('Bearer ', '');

  try {
    const verifier = CognitoJwtVerifier.create({
      userPoolId: process.env.COGNITO_USER_POOL_ID!,
      tokenUse: 'access',
      clientId: process.env.COGNITO_APP_CLIENT_ID!,
    });

    const payload = await verifier.verify(token) as CognitoVerifyResult;
    console.log('Token payload:', payload);

    // Get user details from Cognito
    const cognito = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION });
    const getUserCommand = new GetUserCommand({ AccessToken: token });
    const userResponse = await cognito.send(getUserCommand);

    // Extract GitHub username from Cognito attributes
    const githubUsername = userResponse.UserAttributes?.find(attr => attr.Name === 'custom:gh_username')?.Value;

    return generatePolicy(payload.username, 'Allow', event.methodArn, {
      userId: payload.username,
      githubUsername,
    });
  } catch (error) {
    console.error('Token verification failed:', error);
    throw new Error('Unauthorized');
  }
}

export default handler;
