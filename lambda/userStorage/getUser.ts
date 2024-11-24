import { APIGatewayProxyEvent, APIGatewayProxyHandler } from 'aws-lambda';
import { CognitoIdentityProviderClient, AdminGetUserCommand } from "@aws-sdk/client-cognito-identity-provider";

const cognitoClient = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION });

export const handler: APIGatewayProxyHandler = async (event: APIGatewayProxyEvent) => {
    console.log("GetUserFunction invoked");
    console.log('Full event:', JSON.stringify(event, null, 2));

    try {
        const authorizer = event.requestContext?.authorizer;
        console.log('Validating authorizer context:', {
            fullContext: authorizer,
            expectedPath: 'lambda.userId',
            actualValue: authorizer?.lambda?.userId
        });

        if (!authorizer?.lambda?.userId) {
            const error = {
                message: 'Missing required authorizer context',
                expected: { lambda: { userId: 'string' } },
                received: authorizer,
                location: 'getUser Lambda'
            };
            console.error('Authorization validation failed:', error);
            return {
                statusCode: 401,
                headers: {
                    'Access-Control-Allow-Origin': 'http://localhost:5173',
                    'Access-Control-Allow-Credentials': 'true'
                },
                body: JSON.stringify(error)
            };
        }

        const userId = authorizer.lambda.userId;
        console.log('Using userId from authorizer:', userId);

        const getUserCommand = new AdminGetUserCommand({
            UserPoolId: process.env.COGNITO_USER_POOL_ID,
            Username: userId
        });

        console.log("Getting user details from Cognito for:", userId);
        const startTime = Date.now();
        const response = await cognitoClient.send(getUserCommand);
        console.log(`Cognito GetUser call completed in ${Date.now() - startTime}ms`);
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
        console.error('Error in getUser handler:', {
            error: err,
            errorName: err instanceof Error ? err.name : 'Unknown',
            errorMessage: err instanceof Error ? err.message : String(err),
            stack: err instanceof Error ? err.stack : undefined
        });

        let statusCode = 500;
        let errorMessage = 'Internal server error';
        let errorDetails = err instanceof Error ? err.message : String(err);

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
                error: errorDetails,
                details: {
                    errorType: err instanceof Error ? err.name : 'Unknown',
                    location: 'getUser Lambda'
                }
            }),
        };
    }
};
