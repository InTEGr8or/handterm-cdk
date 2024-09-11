import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';
import path from 'path';
import { ENDPOINTS } from '../lambda/cdkshared/endpoints';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const API_ENDPOINT = process.env.API_ENDPOINT;
const API_URL = API_ENDPOINT?.endsWith('/') ? API_ENDPOINT.slice(0, -1) : API_ENDPOINT;

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
});
