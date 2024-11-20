import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';
import ENDPOINTS from '../lambda/cdkshared/endpoints.json';

// Enhanced environment configuration
dotenv.config({
  path: path.resolve(__dirname, '../.env'),
  debug: process.env.DEBUG === 'true'
});

// Comprehensive API URL determination
const API_ENDPOINT = process.env.API_ENDPOINT || 'http://localhost:3000';
const API_URL = process.env.NODE_ENV === 'development'
  ? 'http://localhost:3000'
  : API_ENDPOINT;

// Enhanced environment variable validation
const requiredEnvVars = process.env.NODE_ENV === 'development'
  ? ['GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET']
  : ['API_ENDPOINT', 'GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET', 'COGNITO_USER_POOL_ID'];

const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingVars.length > 0) {
  console.error('Missing required environment variables:', missingVars);
  throw new Error(`Missing environment variables: ${missingVars.join(', ')}`);
}

// Set robust default values for test environment
process.env.FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
process.env.NODE_ENV = process.env.NODE_ENV || 'test';

// Enhanced logging with more context
console.group('GitHub Auth Test Environment');
console.log('API Endpoint:', API_URL);
console.log('Frontend URL:', process.env.FRONTEND_URL);
console.log('Environment:', process.env.NODE_ENV);
console.log('GitHub Client ID:', process.env.GITHUB_CLIENT_ID ? '✓ Set' : '✗ Not Set');
console.log('Cognito User Pool ID:', process.env.COGNITO_USER_POOL_ID ? '✓ Set' : '✗ Not Set');
console.groupEnd();

describe('GitHub Authentication Flow', () => {
  // This test verifies the initial step of the GitHub OAuth flow:
  // 1. It checks if the API returns a 302 redirect status
  // 2. It verifies that the redirect URL is pointing to the GitHub OAuth endpoint
  // 3. It confirms the presence of required OAuth parameters in the URL
  // 4. It validates the structure and content of the state parameter
  test('1. Redirect to GitHub', async () => {
    const response = await axios.get(`${API_URL}${ENDPOINTS.api.GitHubAuth}`, {
      maxRedirects: 0,
      validateStatus: (status) => status >= 200 && status < 400,
    });

    expect(response.status).toBe(302);
    expect(response.headers.location).toMatch(/^https:\/\/github.com\/login\/oauth\/authorize/);

    const locationUrl = new URL(response.headers.location);
    expect(locationUrl.searchParams.get('client_id')).toBeTruthy();
    expect(locationUrl.searchParams.get('redirect_uri')).toBeTruthy();
    expect(locationUrl.searchParams.get('scope')).toBe('read:user,user:email');
    expect(locationUrl.searchParams.get('state')).toBeTruthy();

    // Parse and validate the state parameter
    const stateParam = locationUrl.searchParams.get('state');
    if (stateParam) {
      const decodedState = JSON.parse(Buffer.from(stateParam, 'base64').toString());
      expect(decodedState).toHaveProperty('timestamp');
      expect(decodedState).toHaveProperty('refererUrl');
      expect(decodedState.cognitoUserId).toBeNull(); // Since we're not logged in for this test
    } else {
      fail('State parameter is missing');
    }
  });

  test('2. OAuth Callback', async () => {
    jest.setTimeout(30000); // Increase timeout to 30 seconds

    // Mock the authorization code from GitHub
    const mockCode = 'mock_authorization_code';

    // Create properly encoded state parameter
    const mockState = Buffer.from(JSON.stringify({
      timestamp: Date.now(),
      referrerUrl: 'https://handterm.com', // Fix typo in property name
      cognitoUserId: 'mock_cognito_user_id'
    })).toString('base64');

    const API_BASE = process.env.NODE_ENV === 'development' ? 'http://localhost:3000' : API_URL;

    try {
      const response = await axios.get(`${API_BASE}/oauth_callback`, {
        params: {
          code: mockCode,
          state: mockState
        },
        maxRedirects: 0,
        validateStatus: (status) => status >= 200 && status < 400,
      });

      expect(response.status).toBe(302);
      expect(response.headers.location).toMatch(/^http:\/\/localhost:5173\?githubAuth=success/);
      expect(response.headers.location).toMatch(/&githubUsername=testuser/);
    } catch (error) {
      if (axios.isAxiosError(error) && error.response) {
        console.error('OAuth Callback Error:', error.response.data);
        console.error('Error status:', error.response.status);
        console.error('Error headers:', error.response.headers);

        // Provide more detailed error information
        if (error.response.data && error.response.data.error) {
          throw new Error(`OAuth Callback failed: ${error.response.data.error}`);
        } else {
          throw new Error(`OAuth Callback failed with status ${error.response.status}`);
        }
      }
      throw error;
    }
  });
});
