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

        let userId, userAttributes, githubId, githubToken;

        // Check if the authorizer is present
        if (event.requestContext.authorizer && event.requestContext.authorizer.lambda) {
            console.log('Authorizer found:', JSON.stringify(event.requestContext.authorizer, null, 2));

            userId = event.requestContext.authorizer.lambda.userId;
            githubId = event.requestContext.authorizer.lambda.githubId;
            githubToken = event.requestContext.authorizer.lambda.githubToken;

            console.log('UserId from authorizer:', userId);
            console.log('GitHub ID from authorizer:', githubId);
            console.log('GitHub Token from authorizer:', githubToken ? '[REDACTED]' : 'Not found');
        } else {
            console.log('No authorizer in requestContext, or no lambda property');
            return {
                statusCode: 401,
                body: JSON.stringify({ message: 'User is not authenticated' }),
            };
        }

        if (!userId) {
            console.error('No userId found in request');
            return {
                statusCode: 401,
                body: JSON.stringify({ message: 'User is not authenticated' }),
            };
        }

        // Fetch additional user details from Cognito if needed
        const getUserCommand = new GetUserCommand({
            AccessToken: event.headers.Authorization?.replace('Bearer ', '') || '',
        });

        console.log('Executing GetUserCommand');
        const response = await cognitoClient.send(getUserCommand);
        console.log('GetUserCommand response:', JSON.stringify(response, null, 2));

        userAttributes = response.UserAttributes?.reduce((acc, attr) => {
            if (attr.Name && attr.Value) {
                acc[attr.Name] = attr.Value;
            }
            return acc;
        }, {} as Record<string, string>) ?? {};

        console.log('User attributes:', JSON.stringify(userAttributes, null, 2));

        return {
            statusCode: 200,
            body: JSON.stringify({
                userId,
                userAttributes,
                githubId,
                githubToken: githubToken ? '[REDACTED]' : null
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
