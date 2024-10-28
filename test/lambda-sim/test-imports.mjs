import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { createRequire } from 'module';
// Mock AWS SDK
import { mockClient } from 'aws-sdk-client-mock';
import { CognitoIdentityProviderClient, AdminUpdateUserAttributesCommand } from '@aws-sdk/client-cognito-identity-provider';

const cognitoMock = mockClient(CognitoIdentityProviderClient);

cognitoMock.on(AdminUpdateUserAttributesCommand).resolves({
  $metadata: {
    httpStatusCode: 200,
    requestId: 'test-request-id',
    attempts: 1,
    totalRetryDelay: 0
  }
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const require = createRequire(import.meta.url);

// Mock GitHub OAuth response
const mockGitHubResponse = {
  token: 'gho_mock_access_token',
  type: 'oauth',
  tokenType: 'bearer',
  refreshToken: 'ghr_mock_refresh_token',
  refreshTokenExpiresAt: new Date(Date.now() + 15811200000).toISOString(),
  expiresAt: new Date(Date.now() + 28800000).toISOString(),
};

// Mock GitHub user response
const mockGitHubUser = {
  login: 'testuser',
  id: 12345,
  node_id: 'MDQ6VXNlcjE=',
  avatar_url: 'https://avatars.githubusercontent.com/u/12345?v=4',
  name: 'Test User',
  email: 'test@example.com'
};

// Simulate Lambda environment
process.env.AWS_LAMBDA_FUNCTION_VERSION = '$LATEST';
process.env.AWS_LAMBDA_FUNCTION_NAME = 'test';
process.env.AWS_REGION = 'us-east-1';
process.env.GITHUB_CLIENT_ID = 'test-client-id';
process.env.GITHUB_CLIENT_SECRET = 'test-client-secret';
process.env.COGNITO_USER_POOL_ID = 'us-east-1_testPool123';
process.env.COGNITO_APP_CLIENT_ID = 'test-client-id';
process.env.FRONTEND_URL = 'http://localhost:5173';
process.env.NODE_ENV = 'test';

// Mock AWS SDK calls
const mockCognitoResponse = {
  $metadata: {
    httpStatusCode: 200,
    requestId: 'test-request-id',
    attempts: 1,
    totalRetryDelay: 0
  }
};

// Mock the CognitoIdentityProviderClient
global.CognitoIdentityProviderClient = class {
  constructor() {}
  async send(command) {
    console.log('Mock Cognito command:', command.constructor.name);
    // Return success response for AdminUpdateUserAttributes
    if (command.constructor.name === 'AdminUpdateUserAttributesCommand') {
      return mockCognitoResponse;
    }
    throw new Error(`Unexpected command: ${command.constructor.name}`);
  }
};

async function runTest() {
  try {
    console.log('Loading handler...');
    const { handler } = await import(
      resolve(__dirname, '../../dist/lambda/authentication/oauth_callback.bundle.js')
    );
    
    const testEvent = {
      queryStringParameters: {
        code: 'test_code',
        state: JSON.stringify({
          timestamp: Date.now(),
          referrerUrl: 'http://localhost:5173/',
          cognitoUserId: 'test-user-id'
        })
      },
      headers: {
        'content-type': 'application/json'
      }
    };

    const context = {
      awsRequestId: 'test-request-id',
      functionName: 'test-function',
      invokedFunctionArn: 'test-arn',
      logGroupName: 'test-log-group',
      logStreamName: 'test-log-stream',
      functionVersion: '$LATEST'
    };

    console.log('Executing handler with test event:', testEvent);
    const result = await handler(testEvent, context);
    console.log('Handler result:', result);
  } catch (error) {
    console.error('Error during test:', error);
    if (error.stack) {
      console.error('Stack trace:', error.stack);
    }
    process.exit(1);
  }
}

runTest();