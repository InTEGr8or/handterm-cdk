import { APIGatewayProxyEvent, APIGatewayEventIdentity } from 'aws-lambda';
import { handler } from '../saveRepoFile';

// Mock console.log and console.error to keep test output clean
global.console.log = jest.fn();
global.console.error = jest.fn();

// Define GitHub error interface
interface GitHubError extends Error {
  status?: number;
  name: string;
}

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
    httpMethod: 'POST',
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
    path: 'test/path.md',
    message: 'test commit message'
  },
  body: 'test content',
  ...overrides
});

// Mock githubUtils
jest.mock('../../authentication/githubUtils', () => ({
  saveRepoFile: jest.fn()
    .mockImplementation(async (userId, options) => {
      // Simulate different responses based on the input
      if (userId === 'error-auth') {
        throw new Error('GitHub tokens not found');
      }
      if (userId === 'error-permission') {
        const error: GitHubError = new Error('Not Found');
        error.name = 'HttpError';
        error.status = 404;
        throw error;
      }

      return {
        commit: {
          sha: 'new-commit-sha',
          html_url: 'https://github.com/test/commit'
        },
        content: {
          sha: 'new-content-sha'
        }
      };
    })
}));

describe('saveRepoFile Lambda handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should successfully save a file', async () => {
    const event = createMockEvent();
    const response = await handler(event as APIGatewayProxyEvent);

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body).toEqual({
      commit: {
        sha: 'new-commit-sha',
        url: 'https://github.com/test/commit'
      },
      content: {
        sha: 'new-content-sha'
      }
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
      message: 'Missing required parameters. Need: repo, path, content, and message'
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

  it('should handle GitHub permission errors', async () => {
    const event = createMockEvent({
      requestContext: {
        ...createMockEvent().requestContext,
        authorizer: {
          lambda: {
            userId: 'error-permission',
            githubUsername: 'test-github-user'
          }
        }
      }
    });
    const response = await handler(event as APIGatewayProxyEvent);

    expect(response.statusCode).toBe(403);
    expect(JSON.parse(response.body)).toEqual({
      message: 'Missing required GitHub permissions. Please re-authenticate with write access.',
      error: 'GITHUB_PERMISSION_DENIED',
      action: 'REAUTHENTICATE'
    });
  });
});
