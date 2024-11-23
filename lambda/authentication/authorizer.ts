import { APIGatewayAuthorizerResult } from 'aws-lambda';
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

interface HttpApiAuthorizerEvent {
  type: string;
  routeArn: string;
  identitySource: string[];
  headers: {
    authorization?: string;
  };
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

export async function handler(event: HttpApiAuthorizerEvent): Promise<APIGatewayAuthorizerResult> {
  // console.log("Event:", event);

  // Extract token from identitySource or headers
  const authHeader = event.identitySource?.[0] || event.headers?.authorization;
  console.log('Auth header:', authHeader);
  console.log('Route ARN:', event.routeArn);

  if (!authHeader) {
    throw new Error('Unauthorized');
  }

  const token = authHeader.replace('Bearer ', '');
  console.log("Token:", token);
  try {
    const verifierConfig = {
      userPoolId: process.env.COGNITO_USER_POOL_ID!,
      tokenUse: 'access',
      clientId: process.env.COGNITO_APP_CLIENT_ID!,
    };
    console.log("verifierConfig:", verifierConfig);

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

    return generatePolicy(payload.username, 'Allow', event.routeArn, {
      userId: payload.username,
      githubUsername,
    });
  } catch (error) {
    console.error('Token verification failed:', error);
    throw new Error('Unauthorized');
  }
}

export default handler;
