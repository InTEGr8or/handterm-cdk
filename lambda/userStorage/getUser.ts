
import { APIGatewayProxyHandler } from 'aws-lambda';
import { CognitoIdentityProviderClient, GetUserCommand } from "@aws-sdk/client-cognito-identity-provider";

const cognitoClient = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION });

export const handler: APIGatewayProxyHandler = async (event) => {
    console.log('GetUserFunction invoked');
    console.log('Event:', JSON.stringify(event, null, 2));
    console.log('Environment variables:', JSON.stringify(process.env, null, 2));

    try {
        console.log('Checking event structure');
        if (!event.requestContext) {
            console.error('No requestContext in event');
            return {
                statusCode: 400,
                body: JSON.stringify({ message: 'Invalid request structure: No requestContext' }),
            };
        }

        console.log('RequestContext:', JSON.stringify(event.requestContext, null, 2));

        const authToken = event.headers?.Authorization || event.headers?.authorization;
        console.log('Authorization header:', authToken);

        if (!authToken) {
            console.error('No Authorization header found');
            return {
                statusCode: 401,
                body: JSON.stringify({ message: 'No Authorization header found' }),
            };
        }

        const token = authToken.replace('Bearer ', '');
        console.log('Extracted token:', token);

        const getUserCommand = new GetUserCommand({
            AccessToken: token,
        });

        console.log('Executing GetUserCommand');
        const response = await cognitoClient.send(getUserCommand);
        console.log('GetUserCommand response:', JSON.stringify(response, null, 2));

        const userAttributes = response.UserAttributes?.reduce((acc, attr) => {
            if (attr.Name && attr.Value) {
                acc[attr.Name] = attr.Value;
            }
            return acc;
        }, {} as Record<string, string>) ?? {};

        console.log('User attributes:', JSON.stringify(userAttributes, null, 2));

        return {
            statusCode: 200,
            body: JSON.stringify({
                username: response.Username,
                userAttributes: userAttributes,
            }),
        };
    } catch (err) {
        console.error('Error in getUser handler:', err);
        if (err instanceof Error) {
            console.error('Error name:', err.name);
            console.error('Error message:', err.message);
            console.error('Error stack:', err.stack);
        }
        return {
            statusCode: 500,
            body: JSON.stringify({ message: 'Internal server error', error: err instanceof Error ? err.message : String(err) }),
        };
    } finally {
        console.log('GetUserFunction ended');
    }
};
