import { handler } from '../listRecentRepos';
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
  return {
    listRepos: jest.fn().mockResolvedValue([
      {
        id: 1,
        name: 'test-repo',
        owner: { login: 'testuser' },
        full_name: 'testuser/test-repo',
        description: 'A test repository',
        html_url: 'https://github.com/testuser/test-repo',
        updated_at: '2023-01-01T00:00:00Z',
        url: 'https://api.github.com/repos/testuser/test-repo',
        trees_url: 'https://api.github.com/repos/testuser/test-repo/git/trees{/sha}'
      }
    ])
  };
});

// Get the mock function for assertions
const mockListRepos = jest.requireMock('../githubUtils').listRepos;

describe('listRecentRepos Lambda', () => {
  const defaultEvent: APIGatewayProxyEvent = {
    headers: {
      Authorization: 'Bearer test-token'
    },
    body: null,
    multiValueHeaders: {},
    httpMethod: 'GET',
    isBase64Encoded: false,
    path: '/listRecentRepos',
    pathParameters: null,
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    requestContext: {
      accountId: 'test-account-id',
      apiId: 'test-api-id',
      authorizer: null,
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
      path: '/listRecentRepos',
      protocol: 'HTTP/1.1',
      requestId: 'test-request-id',
      requestTimeEpoch: 1234567890,
      resourceId: 'test-resource-id',
      resourcePath: '/listRecentRepos',
      stage: 'test'
    },
    resource: '/listRecentRepos'
  };

  beforeEach(() => {
    process.env.GITHUB_APP_ID = 'test-app-id';
    process.env.GITHUB_APP_PRIVATE_KEY = 'test-private-key';
    process.env.COGNITO_USER_POOL_ID = 'test-user-pool';
    process.env.AWS_REGION = 'us-east-1';

    // Reset all mocks
    jest.clearAllMocks();
  });

  it('should successfully retrieve recent repositories', async () => {
    const result = await handler(defaultEvent);
    expect(result.statusCode).toBe(200);

    const repos = JSON.parse(result.body);
    expect(repos.length).toBe(1);
    expect(repos[0].name).toBe('test-repo');
    expect(repos[0].owner.login).toBe('testuser');
  });

  it('should return 401 when no authorization token is provided', async () => {
    const eventWithoutAuth = {
      ...defaultEvent,
      headers: {}
    };

    const result = await handler(eventWithoutAuth);
    expect(result.statusCode).toBe(401);
    expect(JSON.parse(result.body)).toEqual({ error: 'No authorization token provided' });
  });

  it('should return 401 when user is invalid', async () => {
    mockCognitoSend.mockResolvedValueOnce({
      Username: undefined
    });

    const result = await handler(defaultEvent);
    expect(result.statusCode).toBe(401);
    expect(JSON.parse(result.body)).toEqual({ error: 'Invalid user' });
  });

  it('should return 500 when GitHub API fails', async () => {
    mockListRepos.mockRejectedValueOnce(new Error('GitHub API error'));

    const result = await handler(defaultEvent);
    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body)).toEqual({
      error: 'Failed to retrieve recent repositories',
      details: 'GitHub API error'
    });
  });

  it('should return 500 when Cognito API fails', async () => {
    mockCognitoSend.mockRejectedValueOnce(new Error('Cognito API error'));

    const result = await handler(defaultEvent);
    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body)).toEqual({
      error: 'Failed to retrieve recent repositories',
      details: 'Cognito API error'
    });
  });
});
