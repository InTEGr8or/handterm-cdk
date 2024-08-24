import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { CognitoIdentityServiceProvider } from 'aws-sdk';
import axios from 'axios';

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const cognito = new CognitoIdentityServiceProvider();
  const userSub = event.requestContext.authorizer?.claims.sub;

  if (!userSub) {
    return {
      statusCode: 401,
      body: JSON.stringify({ message: 'Unauthorized' }),
    };
  }

  try {
    // Retrieve the GitHub token from Cognito
    const userResponse = await cognito.adminGetUser({
      UserPoolId: process.env.COGNITO_USER_POOL_ID!,
      Username: userSub,
    }).promise();

    const githubToken = userResponse.UserAttributes?.find(attr => attr.Name === 'custom:github_token')?.Value;

    if (!githubToken) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: 'GitHub token not found' }),
      };
    }

    // Use the GitHub token to fetch recent repos
    const response = await axios.get('https://api.github.com/user/repos', {
      params: {
        sort: 'updated',
        per_page: 10,
      },
      headers: {
        'Authorization': `token ${githubToken}`,
        'Accept': 'application/vnd.github.v3+json',
      },
    });

    return {
      statusCode: 200,
      body: JSON.stringify(response.data),
    };
  } catch (error) {
    console.error('Error:', error);
    if (axios.isAxiosError(error) && error.response) {
      return {
        statusCode: error.response.status,
        body: JSON.stringify({ message: error.response.data.message || 'GitHub API error' }),
      };
    }
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
};
