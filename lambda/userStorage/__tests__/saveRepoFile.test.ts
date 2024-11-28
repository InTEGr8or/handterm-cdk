import { handler } from '../saveRepoFile';
import { APIGatewayProxyEvent } from 'aws-lambda';

// Initialize mock before using it
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
  const mockSaveRepoFile = jest.fn().mockResolvedValue({
    commit: {
      sha: 'new-commit-sha',
      html_url: 'https://github.com/owner/repo/commit/new-commit-sha'
    },
    content: {
      sha: 'new-content-sha'
    }
  });

  return {
    getValidGitHubToken: jest.fn().mockResolvedValue('test-token'),
    saveRepoFile: mockSaveRepoFile,
    __mockSaveRepoFile: mockSaveRepoFile
  };
});

// Get the mock function for assertions
const mockSaveRepoFile = jest.requireMock('../githubUtils').__mockSaveRepoFile;

describe('saveRepoFile Lambda', () => {
  const defaultEvent: APIGatewayProxyEvent = {
    headers: {},
    body: 'Updated content',
    multiValueHeaders: {},
    httpMethod: 'POST',
    isBase64Encoded: false,
    path: '/save-repo-file',
    pathParameters: null,
    queryStringParameters: {
      repo: 'testuser/test-repo',
      path: 'README.md',
      message: 'Update README'
    },
    multiValueQueryStringParameters: null,
    stageVariables: null,
    requestContext: {
      accountId: 'test-account-id',
      apiId: 'test-api-id',
      authorizer: {
        lambda: {
          userId: 'test-user-id',
          githubUsername: 'testuser'
        }
      },
      httpMethod: 'POST',
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
      path: '/save-repo-file',
      protocol: 'HTTP/1.1',
      requestId: 'test-request-id',
      requestTimeEpoch: 1234567890,
      resourceId: 'test-resource-id',
      resourcePath: '/save-repo-file',
      stage: 'test'
    },
    resource: '/save-repo-file'
  };

  beforeEach(() => {
    process.env.COGNITO_USER_POOL_ID = 'test-user-pool';
    process.env.AWS_REGION = 'us-east-1';

    // Reset all mocks
    jest.clearAllMocks();
    // Reset default mock implementation
    mockCognitoSend.mockResolvedValue({
      Username: 'test-user-id'
    });
  });

  it('should successfully save file changes', async () => {
    const result = await handler(defaultEvent);
    expect(result.statusCode).toBe(200);

    const response = JSON.parse(result.body);
    expect(response.commit.sha).toBe('new-commit-sha');
    expect(response.commit.url).toBe('https://github.com/owner/repo/commit/new-commit-sha');
    expect(response.content.sha).toBe('new-content-sha');

    // Verify correct parameters were passed to saveRepoFile
    expect(mockSaveRepoFile).toHaveBeenCalledWith('test-user-id', {
      owner: 'testuser',
      repo: 'test-repo',
      path: 'README.md',
      content: 'Updated content',
      message: 'Update README'
    });
  });

  it('should return 400 when required parameters are missing', async () => {
    const eventWithoutParams = {
      ...defaultEvent,
      queryStringParameters: {}
    };

    const result = await handler(eventWithoutParams);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body)).toEqual({
      message: 'Missing required parameters. Need: repo, path, content, and message'
    });
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
    mockSaveRepoFile.mockRejectedValueOnce(new Error('GitHub API error'));

    const result = await handler(defaultEvent);
    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body)).toEqual({
      message: 'An unexpected error occurred',
      error: 'INTERNAL_SERVER_ERROR',
      action: 'RETRY_OR_CONTACT_SUPPORT'
    });
  });

  it('should handle missing content in GitHub response', async () => {
    mockSaveRepoFile.mockResolvedValueOnce({
      commit: { sha: 'new-commit-sha' },
      // Missing content
    });

    const result = await handler(defaultEvent);
    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body)).toEqual({
      message: 'An unexpected error occurred',
      error: 'INTERNAL_SERVER_ERROR',
      action: 'RETRY_OR_CONTACT_SUPPORT'
    });
  });

  it('should use githubUsername when repo doesnt include owner', async () => {
    const eventWithoutOwner = {
      ...defaultEvent,
      queryStringParameters: {
        ...defaultEvent.queryStringParameters,
        repo: 'test-repo' // No owner/
      }
    };

    const result = await handler(eventWithoutOwner);
    expect(result.statusCode).toBe(200);

    // Verify correct owner was used
    expect(mockSaveRepoFile).toHaveBeenCalledWith('test-user-id', {
      owner: 'testuser', // Should use githubUsername
      repo: 'test-repo',
      path: 'README.md',
      content: 'Updated content',
      message: 'Update README'
    });
  });
});
