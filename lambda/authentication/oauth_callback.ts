import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  console.log('OAuth callback received:', event);

  // Here you would handle the OAuth callback logic, such as exchanging the code for a token
  // For now, we'll just return a success message

  return {
    statusCode: 200,
    body: JSON.stringify({
      message: 'OAuth callback handled successfully',
    }),
  };
};
