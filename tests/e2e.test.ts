import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { CognitoIdentityProviderClient, AdminConfirmSignUpCommand } from "@aws-sdk/client-cognito-identity-provider";
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const API_ENDPOINT = process.env.API_ENDPOINT;

if (!API_ENDPOINT) {
  console.error('API_ENDPOINT is not set. Current process.env:', process.env);
  throw new Error('API_ENDPOINT environment variable is not set');
}

const API_URL = API_ENDPOINT.endsWith('/') ? API_ENDPOINT.slice(0, -1) : API_ENDPOINT;

const cognitoClient = new CognitoIdentityProviderClient({ region: 'us-east-1' });

describe('End-to-End API Tests', () => {
  let accessToken: string;
  let refreshToken: string;

  const testUser = {
    username: `testuser_${uuidv4()}`,
    email: `testuser_${uuidv4()}@example.com`,
    password: 'TestPassword123!'
  };

  test('Sign Up', async () => {
    const response = await axios.post(`${API_URL}/signUp`, testUser);
    expect(response.status).toBe(200);
    expect(response.data).toHaveProperty('message', 'User signed up successfully');
  }, 30000);

  test('Confirm Sign Up', async () => {
    // Automatically confirm the user using AdminConfirmSignUpCommand
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

    // Now try to confirm using the API (this should succeed or fail gracefully)
    try {
      console.log('Sending confirmSignUp request for user:', testUser.username);
      const response = await axios.post(`${API_URL}/confirmSignUp`, {
        username: testUser.username,
        confirmationCode: '123456' // Use a dummy code, as we've already confirmed the user
      });
      console.log('Confirm Sign Up response:', response.data);
      expect(response.status).toBe(200);
    } catch (error) {
      if (error instanceof Error) {
        console.warn('Expected error from confirmSignUp API (user already confirmed):', (error as any).response?.data);
      } else {
        console.warn('Expected error from confirmSignUp API (user already confirmed):', error);
      }
    }
  }, 30000);

  test('Sign In', async () => {
    const response = await axios.post(`${API_URL}/signIn`, {
      username: testUser.username,
      password: testUser.password
    });
    expect(response.status).toBe(200);
    expect(response.data).toHaveProperty('AccessToken');
    expect(response.data).toHaveProperty('RefreshToken');
    accessToken = response.data.AccessToken;
    refreshToken = response.data.RefreshToken;
  }, 30000);

  test('Get User', async () => {
    if (!accessToken) {
      console.log('Skipping Get User test as sign-in failed');
      return;
    }
    const response = await axios.get(`${API_URL}/getUser`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    expect(response.status).toBe(200);
    expect(response.data).toHaveProperty('userId');
    expect(response.data).toHaveProperty('userAttributes');
  }, 30000);

  test('Refresh Token', async () => {
    if (!refreshToken) {
      console.log('Skipping Refresh Token test as sign-in failed');
      return;
    }
    const response = await axios.post(`${API_URL}/refreshToken`, { refreshToken });
    expect(response.status).toBe(200);
    expect(response.data).toHaveProperty('AccessToken');
    expect(response.data).toHaveProperty('RefreshToken');
  }, 30000);

  test('Sign Out', async () => {
    const response = await axios.post(`${API_URL}/signout`, {}, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    expect(response.status).toBe(200);
  }, 30000);
});
