import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import axios from 'axios';
import {
  CognitoIdentityProviderClient,
  AdminUpdateUserAttributesCommand
} from "@aws-sdk/client-cognito-identity-provider";

const cognito = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION });

interface GitHubUserInfo {
  id: number;
  login: string;
  email?: string;
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    // Parse the incoming request body
    const { access_token, cognito_user_id } = JSON.parse(event.body || '{}');

    if (!access_token || !cognito_user_id) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: 'Access token and Cognito user ID are required' })
      };
    }

    // Fetch GitHub user information
    const githubUserResponse = await axios.get<GitHubUserInfo>('https://api.github.com/user', {
      headers: {
        'Authorization': `token ${access_token}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    const userInfo = githubUserResponse.data;

    // Prepare Cognito attributes to update
    const attributes = [
      { Name: 'custom:gh_token', Value: access_token },
      { Name: 'custom:gh_id', Value: userInfo.id.toString() },
      { Name: 'custom:gh_username', Value: userInfo.login },
      ...(userInfo.email ? [{ Name: 'custom:gh_email', Value: userInfo.email }] : [])
    ];

    // Update Cognito user attributes
    await cognito.send(new AdminUpdateUserAttributesCommand({
      UserPoolId: process.env.COGNITO_USER_POOL_ID,
      Username: cognito_user_id,
      UserAttributes: attributes
    }));

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'GitHub account successfully linked',
        username: userInfo.login
      })
    };

  } catch (error) {
    console.error('GitHub token save error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: 'Failed to save GitHub token',
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    };
  }
};
