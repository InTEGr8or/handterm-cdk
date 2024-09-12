import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';
import path from 'path';
import { ENDPOINTS } from '../lambda/cdkshared/endpoints';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const API_ENDPOINT = process.env.API_ENDPOINT;
const API_URL = API_ENDPOINT?.endsWith('/') ? API_ENDPOINT.slice(0, -1) : API_ENDPOINT;

// Ensure all required environment variables are set
const requiredEnvVars = ['API_ENDPOINT', 'GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET', 'COGNITO_USER_POOL_ID'];
requiredEnvVars.forEach(varName => {
  if (!process.env[varName]) {
    throw new Error(`Environment variable ${varName} is not set`);
  }
});

// Set default values for test environment
process.env.FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
process.env.NODE_ENV = 'test';

console.log('Test environment variables:', {
  API_ENDPOINT: process.env.API_ENDPOINT,
  GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID ? 'Set' : 'Not set',
  GITHUB_CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET ? 'Set' : 'Not set',
  COGNITO_USER_POOL_ID: process.env.COGNITO_USER_POOL_ID,
  FRONTEND_URL: process.env.FRONTEND_URL,
  NODE_ENV: process.env.NODE_ENV
});

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
    const mockCode = 'mock_authorization_code';
    const mockState = Buffer.from(JSON.stringify({
      timestamp: Date.now(),
      refererUrl: 'https://handterm.com',
      cognitoUserId: 'mock_cognito_user_id'
    })).toString('base64');

    try {
      const response = await axios.get(`${API_URL}${ENDPOINTS.api.OAuthCallback}`, {
        params: {
          code: mockCode,
          state: mockState
        },
        maxRedirects: 0,
        validateStatus: (status) => status >= 200 && status < 400,
      });

      expect(response.status).toBe(302);
      expect(response.headers.location).toMatch(/^https:\/\/handterm\.com\?githubAuth=success/);
      expect(response.headers.location).toMatch(/&githubUsername=/);
    } catch (error) {
      if (axios.isAxiosError(error) && error.response) {
        console.error('OAuth Callback Error:', error.response.data);
        console.error('Error status:', error.response.status);
        console.error('Error headers:', error.response.headers);
        console.error('Full error object:', JSON.stringify(error, null, 2));
        
        // We no longer need to check for ERR_REQUIRE_ESM as we've addressed the import issue
        throw new Error(`OAuth Callback failed: ${JSON.stringify(error.response.data)}`);
      } else {
        console.error('Non-Axios error:', error);
        throw error;
      }
    }
  });
});
