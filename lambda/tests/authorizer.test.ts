import { handler } from '../authentication/authorizer';

interface HttpApiAuthorizerEvent {
  type: string;
  routeArn: string;
  identitySource: string[];
  headers: {
    authorization?: string;
  };
}

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
  const routeArn = 'arn:aws:execute-api:us-east-1:123456789012:api-id/stage/method/resourcepath';

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
    const event: HttpApiAuthorizerEvent = {
      type: 'REQUEST',
      routeArn,
      identitySource: [],
      headers: {}
    };

    const result = await handler(event);
    expect(result.isAuthorized).toBe(false);
    expect(result.context).toEqual({ userId: '', groups: [] });
  });

  it('should allow access when a valid token is provided in identitySource', async () => {
    const event: HttpApiAuthorizerEvent = {
      type: 'REQUEST',
      routeArn,
      identitySource: ['Bearer valid-token'],
      headers: {}
    };

    const result = await handler(event);
    expect(result.isAuthorized).toBe(true);
    expect(result.context).toHaveProperty('userId', 'testuser');
    expect(result.context).toHaveProperty('githubUsername', 'test-github-user');
  });

  it('should allow access when a valid token is provided in headers', async () => {
    const event: HttpApiAuthorizerEvent = {
      type: 'REQUEST',
      routeArn,
      identitySource: [],
      headers: {
        authorization: 'Bearer valid-token'
      }
    };

    const result = await handler(event);
    expect(result.isAuthorized).toBe(true);
    expect(result.context).toHaveProperty('userId', 'testuser');
    expect(result.context).toHaveProperty('githubUsername', 'test-github-user');
  });

  it('should deny access when an invalid token is provided', async () => {
    const event: HttpApiAuthorizerEvent = {
      type: 'REQUEST',
      routeArn,
      identitySource: ['Bearer invalid-token'],
      headers: {}
    };

    const result = await handler(event);
    expect(result.isAuthorized).toBe(false);
    expect(result.context).toEqual({ userId: '', groups: [] });
  });

  it('should still allow access when Cognito GetUser fails but token is valid', async () => {
    mockCognitoSend.mockRejectedValueOnce(new Error('Cognito verification failed'));

    const event: HttpApiAuthorizerEvent = {
      type: 'REQUEST',
      routeArn,
      identitySource: ['Bearer valid-token'],
      headers: {}
    };

    const result = await handler(event);
    expect(result.isAuthorized).toBe(true);
    expect(result.context).toHaveProperty('userId', 'testuser');
    expect(result.context).not.toHaveProperty('githubUsername');
  });
});
