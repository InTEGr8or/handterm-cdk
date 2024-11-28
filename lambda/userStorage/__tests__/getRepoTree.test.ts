import { APIGatewayProxyEvent, APIGatewayEventIdentity } from 'aws-lambda';
import { handler } from '../getRepoTree';

// Mock console.log and console.error to keep test output clean
global.console.log = jest.fn();
global.console.error = jest.fn();

// Create a complete mock identity
const mockIdentity: APIGatewayEventIdentity = {
  accessKey: null,
  accountId: null,
  apiKey: null,
  apiKeyId: null,
  caller: null,
  clientCert: null,
  cognitoAuthenticationProvider: null,
  cognitoAuthenticationType: null,
  cognitoIdentityId: null,
  cognitoIdentityPoolId: null,
  principalOrgId: null,
  sourceIp: '127.0.0.1',
  user: null,
  userAgent: 'test-agent',
  userArn: null
};

// Create a mock event
const createMockEvent = (overrides = {}): Partial<APIGatewayProxyEvent> => ({
  requestContext: {
    accountId: '123456789012',
    apiId: 'test-api',
    authorizer: {
      lambda: {
        userId: 'test-user-id',
        githubUsername: 'test-github-user'
      }
    },
    protocol: 'HTTP/1.1',
    httpMethod: 'GET',
    identity: mockIdentity,
    path: '/test-path',
    requestId: 'test-request-id',
    requestTimeEpoch: 1234567890,
    resourceId: 'test-resource',
    resourcePath: '/test-resource-path',
    stage: 'test'
  },
  queryStringParameters: {
    repo: 'test-repo',
    path: 'test/path'
  },
  ...overrides
});

// Mock githubUtils
jest.mock('../../authentication/githubUtils', () => ({
  getRepoTree: jest.fn()
    .mockImplementation(async (userId, options) => {
      // Simulate different responses based on the input
      if (userId === 'error-auth') {
        throw new Error('GitHub tokens not found');
      }

      return [
        {
          path: 'README.md',
          type: 'blob',
          sha: 'test-sha-1',
          size: 100
        },
        {
          path: 'src',
          type: 'tree',
          sha: 'test-sha-2'
        }
      ];
    })
}));

describe('getRepoTree Lambda handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should successfully get a repo tree', async () => {
    const event = createMockEvent();
    const response = await handler(event as APIGatewayProxyEvent);

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body).toHaveLength(2);
    expect(body[0]).toEqual({
      path: 'README.md',
      type: 'blob',
      sha: 'test-sha-1',
      size: 100
    });
  });

  it('should handle missing authorization', async () => {
    const event = createMockEvent({
      requestContext: {
        ...createMockEvent().requestContext,
        authorizer: null
      }
    });
    const response = await handler(event as APIGatewayProxyEvent);

    expect(response.statusCode).toBe(401);
    expect(JSON.parse(response.body)).toEqual({
      message: 'Unauthorized'
    });
  });

  it('should handle missing parameters', async () => {
    const event = createMockEvent({
      queryStringParameters: {}
    });
    const response = await handler(event as APIGatewayProxyEvent);

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toEqual({
      message: 'Missing required parameter: repo'
    });
  });

  it('should handle GitHub authentication errors', async () => {
    const event = createMockEvent({
      requestContext: {
        ...createMockEvent().requestContext,
        authorizer: {
          lambda: {
            userId: 'error-auth',
            githubUsername: 'test-github-user'
          }
        }
      }
    });
    const response = await handler(event as APIGatewayProxyEvent);

    expect(response.statusCode).toBe(401);
    expect(JSON.parse(response.body)).toEqual({
      message: 'GitHub authentication required',
      error: 'GITHUB_AUTH_REQUIRED',
      action: 'REAUTHENTICATE'
    });
  });
});
