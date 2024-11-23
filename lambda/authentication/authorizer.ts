import { APIGatewayAuthorizerResult } from 'aws-lambda';
import { CognitoJwtVerifier } from 'aws-jwt-verify';
import { CognitoIdentityProviderClient, GetUserCommand } from '@aws-sdk/client-cognito-identity-provider';
import { CognitoJwtVerifierProperties, CognitoVerifyProperties } from 'node_modules/aws-jwt-verify/cognito-verifier';

// Adjusted interface to be more explicit and compatible with JSON structure
interface CognitoVerifyResult {
  sub: string;
  iss: string;
  client_id: string;
  origin_jti: string;
  event_id: string;
  token_use: string;
  scope: string;
  auth_time: number;
  exp: number;
  iat: number;
  jti: string;
  username?: string;
  'cognito:groups'?: string[];
  [key: string]: string | string[] | number | undefined;
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
  // Extract token from identitySource or headers
  const authHeader = event.identitySource?.[0] || event.headers?.authorization;
  console.log('Route ARN:', event.routeArn);

  if (!authHeader) {
    throw new Error('Unauthorized');
  }

  const token = authHeader.replace('Bearer ', '');

  try {
    const verifierProperties: CognitoJwtVerifierProperties = {
      userPoolId: process.env.COGNITO_USER_POOL_ID!,
      tokenUse: 'access' as const,
      clientId: process.env.COGNITO_APP_CLIENT_ID!,
    };
    console.log('Verifier config:', verifierProperties);
    const verifier = CognitoJwtVerifier.create(verifierProperties);

    // Verify the token with both arguments and use type assertion
    const verifyProps: CognitoVerifyProperties = {
      tokenUse: 'access',
      clientId: process.env.COGNITO_APP_CLIENT_ID!,
    }
    console.log('Verify config:', verifyProps);
    const payload = await verifier.verify(token, verifyProps) as CognitoVerifyResult;

    console.log('Token payload:', payload);

    // Get user details from Cognito
    const cognito = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION });
    const getUserCommand = new GetUserCommand({ AccessToken: token });
    const userResponse = await cognito.send(getUserCommand);

    // Extract GitHub username from Cognito attributes
    const githubUsername = userResponse.UserAttributes?.find(attr => attr.Name === 'custom:gh_username')?.Value;

    // Determine username, prioritizing different possible sources
    const username = payload.username || payload.username || 'unknown';

    // Include Cognito groups if available
    const groups = payload['cognito:groups'];

    return generatePolicy(username, 'Allow', event.routeArn, {
      userId: username,
      githubUsername,
      groups,
    });
  } catch (error) {
    console.error('Token verification failed:', error);
    throw new Error('Unauthorized');
  }
}

export default handler;
