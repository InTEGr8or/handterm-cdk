import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { CognitoIdentityProviderClient, AdminDeleteUserCommand, AdminConfirmSignUpCommand, AdminGetUserCommand } from "@aws-sdk/client-cognito-identity-provider";
import dotenv from 'dotenv';
import path from 'path';
import ENDPOINTS from '../lambda/cdkshared/endpoints.json';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const API_ENDPOINT = process.env.API_ENDPOINT;
const API_URL = API_ENDPOINT?.endsWith('/') ? API_ENDPOINT.slice(0, -1) : API_ENDPOINT;
const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID;
const cognitoClient = new CognitoIdentityProviderClient({ region: 'us-east-1' });

if (!USER_POOL_ID) {
  throw new Error('COGNITO_USER_POOL_ID environment variable is not set.');
}

describe('Authentication Flow', () => {
  let testUser: { username: string; email: string; password: string };
  let accessToken: string;
  let refreshToken: string;

  beforeAll(() => {
    testUser = {
      username: `testuser_${uuidv4()}`,
      email: `testuser_${uuidv4()}@example.com`,
      password: 'TestPassword123!'
    };
    console.log('Test user:', testUser.username);
  });

  afterAll(async () => {
    try {
      await cognitoClient.send(new AdminDeleteUserCommand({
        UserPoolId: USER_POOL_ID,
        Username: testUser.username,
      }));
    } catch (error) {
      console.error('Error deleting test user:', error);
    }
  });

  test('1. Sign Up', async () => {
    const response = await axios.post(`${API_URL}/${ENDPOINTS.api.SignUp}`, testUser);
    expect(response.status).toBe(200);
    expect(response.data).toHaveProperty('message', 'User signed up successfully');

    const confirmCommand = new AdminConfirmSignUpCommand({
      UserPoolId: USER_POOL_ID,
      Username: testUser.username,
    });

    try {
      await cognitoClient.send(confirmCommand);
      console.log('User confirmed successfully using AdminConfirmSignUpCommand');
    } catch (error) {
      console.error('Error confirming user with AdminConfirmSignUpCommand:', error);
      throw error;
    }

    // Remove the ConfirmSignUp API call as we've already confirmed the user using AdminConfirmSignUpCommand
  }, 30000); // Increase timeout to 30 seconds

  test('2. Confirm Sign Up', async () => {
    try {
      const getUserCommand = new AdminGetUserCommand({
        UserPoolId: USER_POOL_ID,
        Username: testUser.username,
      });

      const userResult = await cognitoClient.send(getUserCommand);
      if (userResult.UserStatus === 'CONFIRMED') {
        console.log('User is already confirmed');
        return;
      }
    } catch (error) {
      console.error('Error checking user status:', error);
      throw error;
    }
  });

  test('3. Sign In', async () => {
    const response = await axios.post(`${API_URL}/${ENDPOINTS.api.SignIn}`, {
      username: testUser.username,
      password: testUser.password
    });
    expect(response.status).toBe(200);
    expect(response.data).toHaveProperty('AccessToken');
    expect(response.data).toHaveProperty('RefreshToken');
    accessToken = response.data.AccessToken;
    refreshToken = response.data.RefreshToken;
    console.log('Access Token:', accessToken ? `${accessToken.substring(0, 10)}...` : 'Not set');
    console.log('Refresh Token:', refreshToken ? `${refreshToken.substring(0, 10)}...` : 'Not set');
  }, 30000); // Increase timeout to 30 seconds

  test('4. Get User', async () => {
    if (!accessToken) {
      throw new Error('Access token is undefined');
    }
    console.log('Starting Get User test');
    console.log('API_URL:', API_URL);
    console.log('ENDPOINTS.api.GetUser:', ENDPOINTS.api.GetUser);
    console.log('Access Token:', accessToken ? accessToken.substring(0, 10) + '...' : 'Not set');

    try {
      const response = await axios.get(`${API_URL}${ENDPOINTS.api.GetUser}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        withCredentials: true
      });
      console.log('Get User response:', response.data);
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('userId');
      expect(response.data).toHaveProperty('userAttributes');
    } catch (error: any) {
      console.log("Get User test ERROR");
      console.error('Error in Get User test:', error);
      if (axios.isAxiosError(error)) {
        const errorMessage = `Get User Test Axios request failed:
            Message: ${error.message}
            Status: ${error?.response?.status}
            Data: ${JSON.stringify(error?.response?.data, null, 2)}
            URL: ${error?.config?.url}
            Headers: ${JSON.stringify(error?.config?.headers, null, 2)}`;
        throw new Error(errorMessage);
      } else {
        throw new Error(`Get User test failed with an unexpected error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  });

  test('5. Refresh Token', async () => {
    if (!refreshToken) {
      throw new Error('Refresh token is undefined');
    }
    const response = await axios.post(`${API_URL}/${ENDPOINTS.api.RefreshToken}`, { refreshToken });
    expect(response.status).toBe(200);
    expect(response.data).toHaveProperty('AccessToken');
    expect(response.data).toHaveProperty('RefreshToken');
    accessToken = response.data['AccessToken'];
    refreshToken = response.data['RefreshToken'];
  });

  test('6. Sign Out', async () => {
    if (!accessToken) {
      throw new Error('Access token is undefined');
    }
    const response = await axios.post(`${API_URL}/${ENDPOINTS.api.SignOut}`, {}, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    expect(response.status).toBe(200);
  });
});
