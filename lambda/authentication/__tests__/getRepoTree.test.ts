import { handler } from '../getRepoTree';
import { APIGatewayProxyEvent } from 'aws-lambda';

// Mock AWS Cognito
const mockCognitoSend = jest.fn().mockResolvedValue({
  Username: 'test-user-id'
});

jest.mock('@aws-sdk/client-cognito-identity-provider', () => ({
  CognitoIdentityProviderClient: jest.fn().mockImplementation(() => ({
    send: mockCognitoSend
  })),
  GetUserCommand: jest.fn()
}));

// Mock githubUtils
jest.mock('../githubUtils', () => {
  const mockGetRepoTree = jest.fn().mockResolvedValue([
    {
      path: 'README.md',
      type: 'blob',
      sha: 'abcd1234'
    },
    {
      path: 'src',
      type: 'tree',
      sha: 'efgh5678'
    }
  ]);

  return {
    getValidGitHubToken: jest.fn().mockResolvedValue('test-token'),
    getRepoTree: mockGetRepoTree,
    __mockGetRepoTree: mockGetRepoTree
  };
});

// Get the mock function for assertions
const mockGetRepoTree = jest.requireMock('../githubUtils').__mockGetRepoTree;

describe('getRepoTree Lambda', () => {
  const defaultEvent: APIGatewayProxyEvent = {
    headers: {},
    body: null,
    multiValueHeaders: {},
    httpMethod: 'GET',
    isBase64Encoded: false,
    path: '/getRepoTree',
    pathParameters: null,
    queryStringParameters: {
      repo: 'testuser/test-repo'
    },
    multiValueQueryStringParameters: null,
    stageVariables: null,
    requestContext: {
      accountId: 'test-account-id',
      apiId: 'test-api-id',
      authorizer: {
        lambda: {
          userId: 'test-user-id'
        }
      },
      httpMethod: 'GET',
      identity: {
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
        sourceIp: 'test-source-ip',
        user: null,
        userAgent: 'test-user-agent',
        userArn: null
      },
      path: '/getRepoTree',
      protocol: 'HTTP/1.1',
      requestId: 'test-request-id',
      requestTimeEpoch: 1234567890,
      resourceId: 'test-resource-id',
      resourcePath: '/getRepoTree',
      stage: 'test'
    },
    resource: '/getRepoTree'
  };

  beforeEach(() => {
    process.env.GITHUB_APP_ID = 'test-app-id';
    process.env.GITHUB_APP_PRIVATE_KEY = 'test-private-key';
    process.env.COGNITO_USER_POOL_ID = 'test-user-pool';
    process.env.AWS_REGION = 'us-east-1';

    // Reset all mocks
    jest.clearAllMocks();
  });

  it('should successfully retrieve repository tree', async () => {
    const result = await handler(defaultEvent);
    expect(result.statusCode).toBe(200);

    const treeResult = JSON.parse(result.body);
    expect(treeResult.length).toBe(2);
    expect(treeResult[0].path).toBe('README.md');
    expect(treeResult[0].type).toBe('blob');
    expect(treeResult[1].path).toBe('src');
    expect(treeResult[1].type).toBe('tree');
  });

  it('should successfully retrieve file content', async () => {
    const eventWithPath = {
      ...defaultEvent,
      queryStringParameters: {
        ...defaultEvent.queryStringParameters,
        path: 'README.md'
      }
    };

    mockGetRepoTree.mockResolvedValueOnce({
      content: Buffer.from('Hello, World!').toString('base64'),
      encoding: 'base64',
      sha: 'abcd1234',
      size: 13
    });

    const result = await handler(eventWithPath);
    expect(result.statusCode).toBe(200);

    const fileContent = JSON.parse(result.body);
    expect(fileContent.content).toBe('Hello, World!');
    expect(fileContent.encoding).toBe('base64');
    expect(fileContent.sha).toBe('abcd1234');
    expect(fileContent.size).toBe(13);
  });

  it('should return 400 when repo parameter is missing', async () => {
    const eventWithoutRepo = {
      ...defaultEvent,
      queryStringParameters: {}
    };

    const result = await handler(eventWithoutRepo);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body)).toEqual({ message: 'Missing required parameter: repo' });
  });

  it('should return 401 when user is not authorized', async () => {
    const eventWithoutAuth = {
      ...defaultEvent,
      requestContext: {
        ...defaultEvent.requestContext,
        authorizer: null
      }
    };

    const result = await handler(eventWithoutAuth);
    expect(result.statusCode).toBe(401);
    expect(JSON.parse(result.body)).toEqual({ message: 'Unauthorized' });
  });

  it('should return 500 when GitHub API fails', async () => {
    mockGetRepoTree.mockRejectedValueOnce(new Error('GitHub API error'));

    const result = await handler(defaultEvent);
    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body)).toEqual({
      message: 'An unexpected error occurred',
      error: 'INTERNAL_SERVER_ERROR',
      action: 'RETRY_OR_CONTACT_SUPPORT'
    });
  });

  it('should return 401 when GitHub token refresh fails', async () => {
    mockGetRepoTree.mockRejectedValueOnce(new Error('Failed to refresh GitHub token'));

    const result = await handler(defaultEvent);
    expect(result.statusCode).toBe(401);
    expect(JSON.parse(result.body)).toEqual({
      message: 'Failed to refresh GitHub token. Please reauthenticate.',
      error: 'GITHUB_TOKEN_REFRESH_FAILED',
      action: 'REAUTHENTICATE'
    });
  });
});
