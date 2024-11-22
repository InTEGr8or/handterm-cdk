import { APIGatewayTokenAuthorizerEvent, APIGatewayAuthorizerResult } from 'aws-lambda';
import * as jwt from 'jsonwebtoken';

const generatePolicy = (
  principalId: string,
  effect: 'Allow' | 'Deny',
  methodArn: string,
  context?: Record<string, string>
): APIGatewayAuthorizerResult => {
  return {
    principalId,
    policyDocument: {
      Version: '2012-10-17',
      Statement: [
        {
          Action: 'execute-api:Invoke',
          Effect: effect,
          Resource: methodArn
        }
      ]
    },
    context
  };
};

export async function handler(event: APIGatewayTokenAuthorizerEvent): Promise<APIGatewayAuthorizerResult> {
  console.log('Authorizer invoked with event:', JSON.stringify(event));

  // Extract token from Authorization header
  const authHeader = event.authorizationToken;
  console.log('Authorization token:', authHeader);

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.log('No valid Authorization token found');
    return generatePolicy('user', 'Deny', event.methodArn);
  }

  const token = authHeader.split(' ')[1];

  try {
    // In test environment, use a simple secret
    const secret = process.env.NODE_ENV === 'test' ? 'test-secret' : process.env.JWT_SECRET;
    if (!secret) {
      throw new Error('JWT_SECRET is not configured');
    }

    const decoded = jwt.verify(token, secret);

    if (typeof decoded === 'string' || !decoded.sub) {
      throw new Error('Invalid token payload');
    }

    return generatePolicy(decoded.sub, 'Allow', event.methodArn, {
      userId: decoded.sub
    });
  } catch (error) {
    console.error('Error verifying token:', error);
    return generatePolicy('user', 'Deny', event.methodArn);
  }
}

// For CommonJS compatibility
module.exports = { handler };
