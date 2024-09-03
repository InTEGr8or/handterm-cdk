import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { CognitoJwtVerifier } from "aws-jwt-verify";

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  console.log('CheckSession received event:', event);

  const authHeader = event.headers.Authorization || event.headers.authorization;

  if (!authHeader) {
    return {
      statusCode: 401,
      body: JSON.stringify({ message: 'No authorization header' }),
    };
  }

  const token = authHeader.replace('Bearer ', '');

  try {
    const verifier = CognitoJwtVerifier.create({
      userPoolId: process.env.COGNITO_USER_POOL_ID!,
      tokenUse: "access",
      clientId: process.env.COGNITO_APP_CLIENT_ID!,
    });

    const payload = await verifier.verify(token);
    console.log("Token is valid. Payload:", payload);

    return {
      statusCode: 200,
      body: JSON.stringify({ 
        message: 'Session is valid',
        username: payload.username,
        exp: payload.exp
      }),
    };
  } catch (error) {
    console.error('Error verifying token:', error);
    return {
      statusCode: 401,
      body: JSON.stringify({ message: 'Invalid session' }),
    };
  }
};
