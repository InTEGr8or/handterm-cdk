import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { CognitoIdentityProviderClient, AdminDeleteUserCommand, AdminConfirmSignUpCommand, AdminGetUserCommand } from "@aws-sdk/client-cognito-identity-provider";
import dotenv from 'dotenv';
import path from 'path';
import { ENDPOINTS } from '../lambda/cdkshared/endpoints';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const API_ENDPOINT = process.env.API_ENDPOINT;
const API_URL = API_ENDPOINT?.endsWith('/') ? API_ENDPOINT.slice(0, -1) : API_ENDPOINT;
const cognitoClient = new CognitoIdentityProviderClient({ region: 'us-east-1' });

describe('Authentication Flow', () => {
  const testUser = {
    username: `testuser_${uuidv4()}`,
    email: `testuser_${uuidv4()}@example.com`,
    password: 'TestPassword123!'
  };

  let accessToken: string;
  let refreshToken: string;

  beforeAll(() => {
    console.log('Test user:', testUser.username);
  });

  afterAll(async () => {
    // Clean up the test user
    try {
      await cognitoClient.send(new AdminDeleteUserCommand({
        UserPoolId: process.env.USER_POOL_ID!,
        Username: testUser.username,
      }));
      console.log('Test user deleted successfully');
    } catch (error) {
      console.error('Error deleting test user:', error);
    }
  });

  test('1. Sign Up', async () => {
    const response = await axios.post(`${API_URL}/${ENDPOINTS.api.SignUp}`, testUser);
    expect(response.status).toBe(200);
    expect(response.data).toHaveProperty('message', 'User signed up successfully');
  }, 30000);

  test('2. Confirm Sign Up', async () => {
    // Check if the user is already confirmed
    try {
      const getUserCommand = new AdminGetUserCommand({
        UserPoolId: process.env.USER_POOL_ID!,
        Username: testUser.username,
      });

      const userResult = await cognitoClient.send(getUserCommand);
      if (userResult.UserStatus === 'CONFIRMED') {
        console.log('User is already confirmed');
        return;
      }
    } catch (error) {
      if ((error as any).name !== 'UserNotFoundException') {
        console.error('Error checking user status:', error);
      }
    }

    // If not confirmed, proceed with confirmation
    const confirmCommand = new AdminConfirmSignUpCommand({
      UserPoolId: process.env.USER_POOL_ID!,
      Username: testUser.username,
    });

    try {
      await cognitoClient.send(confirmCommand);
      console.log('User confirmed successfully using AdminConfirmSignUpCommand');
    } catch (error) {
      console.error('Error confirming user with AdminConfirmSignUpCommand:', error);
      throw error;
    }

    // Verify the user is confirmed
    const response = await axios.post(`${API_URL}/${ENDPOINTS.api.ConfirmSignUp}`, {
      username: testUser.username,
      confirmationCode: '123456' // This code is not used when using AdminConfirmSignUpCommand
    });
    expect(response.status).toBe(200);
    expect(response.data.message).toMatch(/User confirmed successfully|User is already confirmed/);
  }, 30000);

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
  }, 30000);

  test('4. Get User', async () => {
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
  }, 30000);

  test('5. Refresh Token', async () => {
    const response = await axios.post(`${API_URL}/${ENDPOINTS.api.RefreshToken}`, { refreshToken });
    expect(response.status).toBe(200);
    expect(response.data).toHaveProperty('AccessToken');
    expect(response.data).toHaveProperty('RefreshToken');
  }, 30000);

  test('6. Sign Out', async () => {
    const response = await axios.post(`${API_URL}/${ENDPOINTS.api.SignOut}`, {}, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    expect(response.status).toBe(200);
  }, 30000);
});
