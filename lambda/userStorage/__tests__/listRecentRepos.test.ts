import { handler } from '../listRecentRepos';
import { APIGatewayProxyEvent } from 'aws-lambda';
import * as githubUtils from '../../authentication/githubUtils';
import type { RestEndpointMethodTypes } from "@octokit/plugin-rest-endpoint-methods";

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
jest.mock('../../authentication/githubUtils', () => ({
  ...jest.requireActual('../../authentication/githubUtils'),
  listRepos: jest.fn()
}));

// Get the mock function for assertions
const mockListRepos = githubUtils.listRepos as jest.MockedFunction<typeof githubUtils.listRepos>;

// Create a fully typed mock repository that matches Octokit's type
const createMockRepo = (): RestEndpointMethodTypes["repos"]["listForAuthenticatedUser"]["response"]["data"][0] => ({
  id: 1,
  node_id: 'test-node-id',
  name: 'test-repo',
  full_name: 'testuser/test-repo',
  owner: {
    login: 'testuser',
    id: 123,
    node_id: 'test-owner-node-id',
    avatar_url: 'https://example.com/avatar',
    gravatar_id: '',
    url: 'https://api.github.com/users/testuser',
    html_url: 'https://github.com/testuser',
    followers_url: 'https://api.github.com/users/testuser/followers',
    following_url: 'https://api.github.com/users/testuser/following{/other_user}',
    gists_url: 'https://api.github.com/users/testuser/gists{/gist_id}',
    starred_url: 'https://api.github.com/users/testuser/starred{/owner}{/repo}',
    subscriptions_url: 'https://api.github.com/users/testuser/subscriptions',
    organizations_url: 'https://api.github.com/users/testuser/orgs',
    repos_url: 'https://api.github.com/users/testuser/repos',
    events_url: 'https://api.github.com/users/testuser/events{/privacy}',
    received_events_url: 'https://api.github.com/users/testuser/received_events',
    type: 'User',
    site_admin: false
  },
  private: false,
  html_url: 'https://github.com/testuser/test-repo',
  description: 'A test repository',
  fork: false,
  url: 'https://api.github.com/repos/testuser/test-repo',
  archive_url: 'https://api.github.com/repos/testuser/test-repo/{archive_format}{/ref}',
  assignees_url: 'https://api.github.com/repos/testuser/test-repo/assignees{/user}',
  blobs_url: 'https://api.github.com/repos/testuser/test-repo/git/blobs{/sha}',
  branches_url: 'https://api.github.com/repos/testuser/test-repo/branches{/branch}',
  collaborators_url: 'https://api.github.com/repos/testuser/test-repo/collaborators{/collaborator}',
  comments_url: 'https://api.github.com/repos/testuser/test-repo/comments{/number}',
  commits_url: 'https://api.github.com/repos/testuser/test-repo/commits{/sha}',
  compare_url: 'https://api.github.com/repos/testuser/test-repo/compare/{base}...{head}',
  contents_url: 'https://api.github.com/repos/testuser/test-repo/contents/{+path}',
  contributors_url: 'https://api.github.com/repos/testuser/test-repo/contributors',
  deployments_url: 'https://api.github.com/repos/testuser/test-repo/deployments',
  downloads_url: 'https://api.github.com/repos/testuser/test-repo/downloads',
  events_url: 'https://api.github.com/repos/testuser/test-repo/events',
  forks_url: 'https://api.github.com/repos/testuser/test-repo/forks',
  git_commits_url: 'https://api.github.com/repos/testuser/test-repo/git/commits{/sha}',
  git_refs_url: 'https://api.github.com/repos/testuser/test-repo/git/refs{/sha}',
  git_tags_url: 'https://api.github.com/repos/testuser/test-repo/git/tags{/sha}',
  git_url: 'git://github.com/testuser/test-repo.git',
  issue_comment_url: 'https://api.github.com/repos/testuser/test-repo/issues/comments{/number}',
  issues_url: 'https://api.github.com/repos/testuser/test-repo/issues{/number}',
  keys_url: 'https://api.github.com/repos/testuser/test-repo/keys{/key_id}',
  labels_url: 'https://api.github.com/repos/testuser/test-repo/labels{/name}',
  languages_url: 'https://api.github.com/repos/testuser/test-repo/languages',
  merges_url: 'https://api.github.com/repos/testuser/test-repo/merges',
  milestones_url: 'https://api.github.com/repos/testuser/test-repo/milestones{/number}',
  notifications_url: 'https://api.github.com/repos/testuser/test-repo/notifications{?since,all,participating}',
  pulls_url: 'https://api.github.com/repos/testuser/test-repo/pulls{/number}',
  releases_url: 'https://api.github.com/repos/testuser/test-repo/releases{/id}',
  ssh_url: 'git@github.com:testuser/test-repo.git',
  stargazers_url: 'https://api.github.com/repos/testuser/test-repo/stargazers',
  statuses_url: 'https://api.github.com/repos/testuser/test-repo/statuses/{sha}',
  subscribers_url: 'https://api.github.com/repos/testuser/test-repo/subscribers',
  subscription_url: 'https://api.github.com/repos/testuser/test-repo/subscription',
  tags_url: 'https://api.github.com/repos/testuser/test-repo/tags',
  teams_url: 'https://api.github.com/repos/testuser/test-repo/teams',
  trees_url: 'https://api.github.com/repos/testuser/test-repo/git/trees{/sha}',
  clone_url: 'https://github.com/testuser/test-repo.git',
  mirror_url: null,
  hooks_url: 'https://api.github.com/repos/testuser/test-repo/hooks',
  svn_url: 'https://github.com/testuser/test-repo',
  homepage: null,
  language: null,
  forks_count: 0,
  stargazers_count: 0,
  watchers_count: 0,
  size: 0,
  default_branch: 'main',
  open_issues_count: 0,
  is_template: false,
  topics: [],
  has_issues: true,
  has_projects: true,
  has_wiki: true,
  has_pages: false,
  has_downloads: true,
  archived: false,
  disabled: false,
  visibility: 'public',
  pushed_at: '2023-01-01T00:00:00Z',
  created_at: '2023-01-01T00:00:00Z',
  updated_at: '2023-01-01T00:00:00Z',
  permissions: {
    admin: true,
    maintain: true,
    push: true,
    triage: true,
    pull: true
  },
  temp_clone_token: undefined,
  delete_branch_on_merge: false,
  license: null,
  forks: 0,
  issue_events_url: 'https://github.com/testuser/test-repo/issues',
  open_issues: 0,
  watchers: 0
});

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
    // Reset default mock implementation
    mockCognitoSend.mockResolvedValue({
      Username: 'test-user-id'
    });
    mockListRepos.mockResolvedValue([createMockRepo()]);
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
    // Mock Cognito to return undefined Username
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
