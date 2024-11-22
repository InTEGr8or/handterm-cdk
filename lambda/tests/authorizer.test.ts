import { handler } from '../authentication/authorizer';
import { APIGatewayTokenAuthorizerEvent } from 'aws-lambda';
import * as jwt from 'jsonwebtoken';

describe('Authorizer', () => {
  const methodArn = 'arn:aws:execute-api:us-east-1:123456789012:api-id/stage/method/resourcepath';
  const TEST_SECRET = 'test-secret';

  beforeEach(() => {
    process.env.COGNITO_USER_POOL_ID = 'test-pool-id';
    process.env.NODE_ENV = 'test';
  });

  afterEach(() => {
    delete process.env.COGNITO_USER_POOL_ID;
    delete process.env.NODE_ENV;
  });

  it('should deny access when no token is provided', async () => {
    const event: APIGatewayTokenAuthorizerEvent = {
      type: 'TOKEN',
      methodArn,
      authorizationToken: ''
    };

    const result = await handler(event);
    expect(result.policyDocument.Statement[0].Effect).toBe('Deny');
  });

  it('should allow access when a valid token is provided', async () => {
    // Create a valid token signed with our test secret
    const token = jwt.sign(
      { sub: 'testuser', iat: Math.floor(Date.now() / 1000) },
      TEST_SECRET
    );

    const event: APIGatewayTokenAuthorizerEvent = {
      type: 'TOKEN',
      methodArn,
      authorizationToken: `Bearer ${token}`
    };

    const result = await handler(event);
    expect(result.policyDocument.Statement[0].Effect).toBe('Allow');
    expect(result.context).toHaveProperty('userId', 'testuser');
  });

  it('should deny access when an invalid token is provided', async () => {
    const event: APIGatewayTokenAuthorizerEvent = {
      type: 'TOKEN',
      methodArn,
      authorizationToken: 'Bearer invalidtoken'
    };

    const result = await handler(event);
    expect(result.policyDocument.Statement[0].Effect).toBe('Deny');
  });

  it('should deny access when token is signed with wrong secret', async () => {
    // Create a token signed with a different secret
    const token = jwt.sign(
      { sub: 'testuser', iat: Math.floor(Date.now() / 1000) },
      'wrong-secret'
    );

    const event: APIGatewayTokenAuthorizerEvent = {
      type: 'TOKEN',
      methodArn,
      authorizationToken: `Bearer ${token}`
    };

    const result = await handler(event);
    expect(result.policyDocument.Statement[0].Effect).toBe('Deny');
  });
});
