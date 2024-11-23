import { APIGatewayProxyEvent, APIGatewayProxyHandler } from 'aws-lambda';
import { CognitoIdentityProviderClient, GetUserCommand } from "@aws-sdk/client-cognito-identity-provider";

const cognitoClient = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION });

export const handler: APIGatewayProxyHandler = async (event: APIGatewayProxyEvent) => {
    console.log("GetUserFunction invoked");
    console.log('Full event:', event);

    try {
        const requestContext = event.requestContext;
        if (!requestContext) return { statusCode: 401, message: 'No requestContext', body: '' }
        console.log('Lambda:', event?.requestContext?.authorizer?.lambda);
        const accessToken = event.headers?.authorization?.split(' ')[1];
        if (!accessToken) {
            console.log("accessToken", accessToken);
            return {
                statusCode: 401,
                body: JSON.stringify({ message: 'No access token provided', error: 'Missing Authorization header' }),
            };
        }

        console.log("Getting user command");
        const getUserCommand = new GetUserCommand({ AccessToken: accessToken });
        console.log("User command:", getUserCommand);
        const response = await cognitoClient.send(getUserCommand);
        console.log("Response:", response);
        const userAttributes = response.UserAttributes?.reduce((acc, attr) => {
            if (attr.Name && attr.Value) {
                acc[attr.Name] = attr.Value;
            }
            return acc;
        }, {} as Record<string, string>) ?? {};

        return {
            statusCode: 200,
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
            if (err.name === 'NotAuthorizedException') {
                statusCode = 401;
                errorMessage = 'Invalid or expired access token';
            } else if (err.name === 'InvalidParameterException') {
                statusCode = 400;
                errorMessage = 'Invalid access token format';
            }
        }

        return {
            statusCode,
            body: JSON.stringify({
                message: errorMessage,
                error: err instanceof Error ? err.message : String(err)
            }),
        };
    }
};
