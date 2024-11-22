import { APIGatewayProxyEvent } from 'aws-lambda';
import { handler } from '../lambda/authentication/oauth_callback';
import { AdminUpdateUserAttributesCommand } from '@aws-sdk/client-cognito-identity-provider';
import * as jwt from 'jsonwebtoken';

// Mock axios
jest.mock('axios', () => ({
  post: jest.fn().mockResolvedValue({
    data: {
      access_token: 'mock_access_token',
      refresh_token: 'mock_refresh_token',
      expires_in: '3600',
      refresh_token_expires_in: '7200'
    }
  }),
  get: jest.fn().mockResolvedValue({
    data: {
      id: 12345,
      login: 'mock_user',
      name: 'Mock User',
      email: 'mock@example.com',
      avatar_url: 'https://example.com/avatar.png'
    }
  })
}));

// Mock AWS SDK
jest.mock('@aws-sdk/client-cognito-identity-provider', () => ({
  CognitoIdentityProviderClient: jest.fn().mockImplementation(() => ({
    send: jest.fn().mockResolvedValue({}),
  })),
  AdminUpdateUserAttributesCommand: jest.fn(),
}));

describe('OAuth Callback Handler', () => {
  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();
  });

  it('should handle successful GitHub OAuth callback', async () => {
    // Create a mock JWT token
    const mockToken = jwt.sign({
      'cognito:username': 'test_user',
      sub: '123',
      email: 'test@example.com'
    }, 'test_secret');

    const mockState = Buffer.from(JSON.stringify({
      timestamp: Date.now(),
      refererUrl: 'http://localhost:5173',
      cognitoUserId: mockToken
    })).toString('base64');

    const mockEvent = {
      queryStringParameters: {
        code: 'test-auth-code',
        state: mockState
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
    expect(response.headers?.Location).toContain('githubLogin=success');
    expect(response.headers?.Location).toContain('githubUsername=mock_user');

    // Verify Cognito update was called
    expect(AdminUpdateUserAttributesCommand).toHaveBeenCalled();
  });

  it('should handle missing parameters', async () => {
    const mockEvent = {
      queryStringParameters: null,
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

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.message).toBe('No authorization code provided');
  });

  it('should handle missing state parameter', async () => {
    const mockEvent = {
      queryStringParameters: {
        code: 'test-auth-code'
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

    expect(response.statusCode).toBe(404);
    const body = JSON.parse(response.body);
    expect(body.message).toBe('No `state` property passed back to callback');
  });

  it('should handle invalid state parameter', async () => {
    const mockEvent = {
      queryStringParameters: {
        code: 'test-auth-code',
        state: 'invalid-state'
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

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.message).toBe('Invalid state parameter.');
  });

  it('should handle missing Cognito user ID', async () => {
    const mockState = Buffer.from(JSON.stringify({
      timestamp: Date.now(),
      refererUrl: 'http://localhost:5173'
      // No cognitoUserId
    })).toString('base64');

    const mockEvent = {
      queryStringParameters: {
        code: 'test-auth-code',
        state: mockState
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

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.message).toBe('No Cognito user ID provided in state');
  });
});
