// tests/setup.ts
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env file
dotenv.config({
  path: path.resolve(__dirname, '../.env'),
  debug: process.env.DEBUG === 'true'
});

// Set default test environment variables
const defaultEnv = {
  API_ENDPOINT: 'http://localhost:3000',
  GITHUB_CLIENT_ID: 'test-client-id',
  GITHUB_CLIENT_SECRET: 'test-client-secret',
  GITHUB_APP_ID: 'test-app-id',
  GITHUB_APP_PRIVATE_KEY: 'test-app-private-key',
  COGNITO_USER_POOL_ID: 'test-pool-id',
  COGNITO_APP_CLIENT_ID: 'test-app-client-id',
  FRONTEND_URL: 'http://localhost:5173',
  NODE_ENV: 'test',
  JWT_SECRET: 'test-secret'
};

// Set environment variables if not already set
Object.entries(defaultEnv).forEach(([key, value]) => {
  if (!process.env[key]) {
    process.env[key] = value;
  }
});

// Global beforeAll hook
beforeAll(() => {
  // Any additional test setup
});

// Global afterAll hook
afterAll(() => {
  // Any cleanup needed
});

// Global beforeEach hook
beforeEach(() => {
  // Reset any mocks or state before each test
  jest.resetModules();

  // Ensure test environment variables are set
  Object.entries(defaultEnv).forEach(([key, value]) => {
    process.env[key] = value;
  });
});

// Global afterEach hook
afterEach(() => {
  // Clean up after each test
  jest.clearAllMocks();
});
