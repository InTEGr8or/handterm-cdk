import { handler } from '../authentication/authorizer';
import { APIGatewayTokenAuthorizerEvent } from 'aws-lambda';

// Mock CognitoJwtVerifier
jest.mock('aws-jwt-verify', () => ({
  CognitoJwtVerifier: {
    create: jest.fn().mockReturnValue({
      verify: jest.fn().mockImplementation(async (token) => {
        if (token === 'valid-token') {
          return {
            sub: 'testuser',
            token_use: 'access',
            scope: 'test-scope',
            auth_time: Date.now(),
            iss: 'test-issuer',
            exp: Date.now() + 3600000,
            iat: Date.now(),
            client_id: 'test-client',
            username: 'testuser'
          };
        }
        throw new Error('Invalid token');
      })
    })
  }
}));

// Mock Cognito Client
const mockCognitoSend = jest.fn().mockImplementation(async () => ({
  UserAttributes: [
    {
      Name: 'custom:gh_username',
      Value: 'test-github-user'
    }
  ]
}));

jest.mock('@aws-sdk/client-cognito-identity-provider', () => ({
  CognitoIdentityProviderClient: jest.fn().mockImplementation(() => ({
    send: mockCognitoSend
  })),
  GetUserCommand: jest.fn()
}));

describe('Authorizer', () => {
  const methodArn = 'arn:aws:execute-api:us-east-1:123456789012:api-id/stage/method/resourcepath';

  beforeEach(() => {
    process.env.COGNITO_USER_POOL_ID = 'test-pool-id';
    process.env.COGNITO_APP_CLIENT_ID = 'test-client-id';
    process.env.AWS_REGION = 'us-east-1';
    jest.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.COGNITO_USER_POOL_ID;
    delete process.env.COGNITO_APP_CLIENT_ID;
    delete process.env.AWS_REGION;
  });

  it('should deny access when no token is provided', async () => {
    const event: APIGatewayTokenAuthorizerEvent = {
      type: 'TOKEN',
      methodArn,
      authorizationToken: ''
    };

    await expect(handler(event)).rejects.toThrow('Unauthorized');
  });

  it('should allow access when a valid token is provided', async () => {
    const event: APIGatewayTokenAuthorizerEvent = {
      type: 'TOKEN',
      methodArn,
      authorizationToken: 'Bearer valid-token'
    };

    const result = await handler(event);
    expect(result.policyDocument.Statement[0].Effect).toBe('Allow');
    expect(result.context).toHaveProperty('userId', 'testuser');
    expect(result.context).toHaveProperty('githubUsername', 'test-github-user');
  });

  it('should deny access when an invalid token is provided', async () => {
    const event: APIGatewayTokenAuthorizerEvent = {
      type: 'TOKEN',
      methodArn,
      authorizationToken: 'Bearer invalid-token'
    };

    await expect(handler(event)).rejects.toThrow('Unauthorized');
  });

  it('should deny access when Cognito verification fails', async () => {
    mockCognitoSend.mockRejectedValueOnce(new Error('Cognito verification failed'));

    const event: APIGatewayTokenAuthorizerEvent = {
      type: 'TOKEN',
      methodArn,
      authorizationToken: 'Bearer valid-token'
    };

    await expect(handler(event)).rejects.toThrow('Unauthorized');
  });
});
