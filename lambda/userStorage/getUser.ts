import { APIGatewayProxyEvent, APIGatewayProxyHandler } from 'aws-lambda';
import { CognitoIdentityProviderClient, AdminGetUserCommand } from "@aws-sdk/client-cognito-identity-provider";

const cognitoClient = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION });

export const handler: APIGatewayProxyHandler = async (event: APIGatewayProxyEvent) => {
    console.log("GetUserFunction invoked");
    console.log('Event:', JSON.stringify(event, null, 2));

    try {
        const authorizer = event.requestContext?.authorizer;
        console.log('Authorizer context:', authorizer);

        if (!authorizer?.userId) {
            console.error('No userId in authorizer context');
            return {
                statusCode: 401,
                body: JSON.stringify({ message: 'Unauthorized', error: 'Missing user context' }),
            };
        }

        const userId = authorizer.userId;
        console.log('UserId from authorizer:', userId);

        const getUserCommand = new AdminGetUserCommand({
            UserPoolId: process.env.COGNITO_USER_POOL_ID,
            Username: userId
        });

        console.log("Getting user details for:", userId);
        const response = await cognitoClient.send(getUserCommand);
        console.log("Cognito response:", response);

        const userAttributes = response.UserAttributes?.reduce((acc, attr) => {
            if (attr.Name && attr.Value) {
                acc[attr.Name] = attr.Value;
            }
            return acc;
        }, {} as Record<string, string>) ?? {};

        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': 'http://localhost:5173',
                'Access-Control-Allow-Credentials': 'true'
            },
            body: JSON.stringify({
                userId: response.Username,
                userAttributes,
            }),
        };
    } catch (err) {
        console.error('Error in getUser handler:', err);

        let statusCode = 500;
        let errorMessage = 'Internal server error';

        if (err instanceof Error) {
            if (err.name === 'UserNotFoundException') {
                statusCode = 404;
                errorMessage = 'User not found';
            } else if (err.name === 'InvalidParameterException') {
                statusCode = 400;
                errorMessage = 'Invalid parameters';
            }
        }

        return {
            statusCode,
            headers: {
                'Access-Control-Allow-Origin': 'http://localhost:5173',
                'Access-Control-Allow-Credentials': 'true'
            },
            body: JSON.stringify({
                message: errorMessage,
                error: err instanceof Error ? err.message : String(err)
            }),
        };
    }
};
