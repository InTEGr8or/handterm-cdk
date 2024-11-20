import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const require = createRequire(import.meta.url);

// Mock AWS SDK
const mockCognitoClient = {
    send: async (command) => {
        console.log('Mock Cognito client called with command:', command.constructor.name);
        if (command.constructor.name === 'GetUserCommand') {
            return {
                Username: 'test-user-id'
            };
        }
        throw new Error(`Unexpected command: ${command.constructor.name}`);
    }
};

// Mock AWS SDK modules
const mockAwsSdk = {
    CognitoIdentityProviderClient: class {
        constructor() {
            console.log('Mock CognitoIdentityProviderClient constructed');
            return mockCognitoClient;
        }
    },
    GetUserCommand: class {
        constructor(params) {
            console.log('Mock GetUserCommand constructed with params:', params);
            this.params = params;
        }
    }
};

// Mock githubUtils
const mockGithubUtils = {
    getValidGitHubToken: async () => {
        console.log('Mock getValidGitHubToken called');
        return 'mock-github-token';
    }
};

async function testListRecentRepos() {
    console.log('Testing listRecentRepos Lambda function...');

    try {
        // Set up environment
        process.env.AWS_REGION = 'us-east-1';

        // Import and patch the Lambda code
        const lambdaPath = resolve(__dirname, '../../dist/lambda/authentication/listRecentRepos.js');
        console.log('Loading Lambda from:', lambdaPath);

        // Register mocks
        globalThis.mockModules = {
            '@aws-sdk/client-cognito-identity-provider': mockAwsSdk,
            './githubUtils': mockGithubUtils
        };

        // Import the Lambda with mocked dependencies
        const { handler } = await import(lambdaPath);

        // Test with valid auth header
        const mockEvent = {
            headers: {
                Authorization: 'Bearer test-token'
            }
        };

        const result = await handler(mockEvent);
        console.log('Test result:', result);

        // Basic validation
        if (result.statusCode !== 200) {
            throw new Error(`Expected status code 200 but got ${result.statusCode}: ${result.body}`);
        }

        const body = JSON.parse(result.body);
        if (!Array.isArray(body)) {
            throw new Error('Expected body to be an array');
        }

        console.log('Test completed successfully');
    } catch (error) {
        console.error('Test failed:', error);
        if (error.stack) {
            console.error('Stack trace:', error.stack);
        }
        process.exit(1);
    }
}

// Run the test
testListRecentRepos();
