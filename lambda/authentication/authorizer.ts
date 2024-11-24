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

// Simple response format for HTTP API authorizer
interface SimpleAuthorizerResponse {
  isAuthorized: boolean;
  context: AuthorizerContext;
}

interface AuthorizerContext {
  userId: string;
  groups: string[];
  githubUsername?: string;
}

export async function handler(event: HttpApiAuthorizerEvent): Promise<SimpleAuthorizerResponse> {
  // Extract token from identitySource or headers
  const authHeader = event.identitySource?.[0] || event.headers?.authorization;
  console.log('Route ARN:', event.routeArn);

  if (!authHeader) {
    console.log('No authorization header found');
    return {
      isAuthorized: false,
      context: { userId: '', groups: [] }
    };
  }

  const token = authHeader.replace('Bearer ', '');

  try {
    const verifierProperties: CognitoJwtVerifierProperties = {
      userPoolId: process.env.COGNITO_USER_POOL_ID!,
      tokenUse: 'access' as const,
      clientId: process.env.COGNITO_USER_POOL_CLIENT_ID!,
    };
    console.log('Verifier config:', verifierProperties);
    const verifier = CognitoJwtVerifier.create(verifierProperties);

    // Verify the token with both arguments and use type assertion
    const verifyProps: CognitoVerifyProperties = {
      tokenUse: 'access',
      clientId: process.env.COGNITO_USER_POOL_CLIENT_ID!,
    }
    console.log('Verify config:', verifyProps);
    const payload = await verifier.verify(token, verifyProps) as CognitoVerifyResult;

    console.log('Token payload:', payload);

    // Initialize context with data from JWT payload
    const context: AuthorizerContext = {
      userId: payload.username || 'unknown',
      groups: payload['cognito:groups'] || []
    };

    try {
      // Try to get additional user details from Cognito
      const cognito = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION });
      const getUserCommand = new GetUserCommand({ AccessToken: token });
      console.log('Getting user details with token');
      const userResponse = await cognito.send(getUserCommand);
      console.log('Cognito GetUser response:', userResponse);

      // Add GitHub username if available
      const githubUsername = userResponse.UserAttributes?.find(attr => attr.Name === 'custom:gh_username')?.Value;
      if (githubUsername) {
        context.githubUsername = githubUsername;
      }
    } catch (error) {
      // Log the error but don't fail authorization
      console.error('Failed to get additional user details:', error);
      // Continue with basic context from JWT
    }

    console.log('Returning authorized response with context:', context);
    return {
      isAuthorized: true,
      context
    };
  } catch (error) {
    console.error('Token verification failed:', error);
    return {
      isAuthorized: false,
      context: { userId: '', groups: [] }
    };
  }
}

export default handler;
