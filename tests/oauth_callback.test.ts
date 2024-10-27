import { APIGatewayProxyEvent } from 'aws-lambda';
import { handler } from '../lambda/authentication/oauth_callback';
import { AdminUpdateUserAttributesCommand } from '@aws-sdk/client-cognito-identity-provider';

// Mock the ES modules
jest.mock('@octokit/rest', () => ({
  Octokit: jest.fn().mockImplementation(() => ({
    auth: jest.fn(),
    users: {
      getAuthenticated: jest.fn().mockResolvedValue({
        data: {
          login: 'mock_user',
          id: 12345,
          name: 'Mock User',
          email: 'mock@example.com',
          avatar_url: 'https://example.com/avatar.png',
        }
      })
    }
  }))
}));

jest.mock('@octokit/auth-oauth-app', () => ({
  createOAuthAppAuth: jest.fn()
}));

jest.mock('@aws-sdk/client-cognito-identity-provider', () => ({
  CognitoIdentityProviderClient: jest.fn().mockImplementation(() => ({
    send: jest.fn().mockResolvedValue({}),
  })),
  AdminUpdateUserAttributesCommand: jest.fn(),
}));

describe('OAuth Callback Handler', () => {
  beforeEach(() => {
    // Set up environment variables
    process.env.GITHUB_CLIENT_ID = 'test-client-id';
    process.env.GITHUB_CLIENT_SECRET = 'test-client-secret';
    process.env.COGNITO_USER_POOL_ID = 'test-pool-id';
    process.env.FRONTEND_URL = 'http://localhost:5173';
    process.env.NODE_ENV = 'test';
    
    // Clear all mocks
    jest.clearAllMocks();
  });

  it('should handle successful GitHub OAuth callback', async () => {
    const mockEvent = {
      queryStringParameters: {
        code: 'test-auth-code',
        state: 'test-user-id'
      },
      body: null,
      headers: {},
      multiValueHeaders: {},
      httpMethod: 'GET',
      isBase64Encoded: false,
      path: '/oauth_callback',
      pathParameters: null,
      multiValueQueryStringParameters: null,
      stageVariables: null,
      requestContext: {} as any,
      resource: ''
    } as APIGatewayProxyEvent;

    const response = await handler(mockEvent);
    
    expect(response.statusCode).toBe(302);
    expect(response.headers?.Location).toContain('githubAuth=success');
    expect(response.headers?.Location).toContain('githubUsername=');
    
    // Verify Cognito update was called
    expect(AdminUpdateUserAttributesCommand).toHaveBeenCalled();
  });

  it('should handle missing parameters', async () => {
    const mockEvent = {
      queryStringParameters: {}
    } as APIGatewayProxyEvent;

    const response = await handler(mockEvent);
    
    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.error).toBe('Missing required parameters');
  });

  it('should handle missing environment variables', async () => {
    // Clear required env var
    delete process.env.GITHUB_CLIENT_ID;
    
    const mockEvent: APIGatewayProxyEvent = {
      queryStringParameters: {
        code: 'test-auth-code',
        state: 'test-user-id'
      },
      body: null,
      headers: {},
      multiValueHeaders: {},
      httpMethod: 'GET',
      isBase64Encoded: false,
      path: '/oauth_callback',
      pathParameters: null,
      multiValueQueryStringParameters: null,
      stageVariables: null,
      requestContext: {} as any,
      resource: ''
    };

    const response = await handler(mockEvent);
    
    expect(response.statusCode).toBe(500);
    const body = JSON.parse(response.body);
    expect(body.missingEnvVars).toContain('GITHUB_CLIENT_ID');
  });
  it('should handle ES Module import correctly', async () => {
    const mockEvent = {
      queryStringParameters: {
        code: 'test-auth-code',
        state: 'test-user-id'
      },
      body: null,
      headers: {},
      multiValueHeaders: {},
      httpMethod: 'GET',
      isBase64Encoded: false,
      path: '/oauth_callback',
      pathParameters: null,
      multiValueQueryStringParameters: null,
      stageVariables: null,
      requestContext: {} as any,
      resource: ''
    } as APIGatewayProxyEvent;

    const response = await handler(mockEvent);
    expect(response.statusCode).not.toBe(500);
    
    if (response.statusCode === 500) {
      const body = JSON.parse(response.body);
      expect(body.error).not.toContain('require() of ES Module');
    }
  });
});
