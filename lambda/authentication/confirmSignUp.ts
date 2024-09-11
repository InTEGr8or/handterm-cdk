import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { CognitoIdentityProviderClient, ConfirmSignUpCommand, AdminGetUserCommand, UserNotFoundException, CodeMismatchException, ExpiredCodeException, NotAuthorizedException } from "@aws-sdk/client-cognito-identity-provider";

const cognitoClient = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION });

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    console.log('ConfirmSignUp Lambda invoked');
    console.log('Full event:', event);

    if (!event.body) {
        console.error('Invalid request body');
        return { statusCode: 400, body: JSON.stringify({ message: 'Invalid request body' }) };
    }

    let username, confirmationCode;
    try {
        ({ username, confirmationCode } = JSON.parse(event.body));
    } catch (error) {
        console.error('Error parsing request body:', error);
        return { statusCode: 400, body: JSON.stringify({ message: 'Invalid JSON in request body' }) };
    }

    if (!username || !confirmationCode) {
        console.error('Missing required fields');
        return { statusCode: 400, body: JSON.stringify({ message: 'Missing required fields' }) };
    }

    const params = {
        ClientId: process.env.COGNITO_APP_CLIENT_ID,
        Username: username,
        ConfirmationCode: confirmationCode,
    };

    console.log('Confirmation params:', params);

    try {
        // First, check if the user is already confirmed
        const getUserCommand = new AdminGetUserCommand({
            UserPoolId: process.env.COGNITO_USER_POOL_ID,
            Username: username,
        });
        const userResult = await cognitoClient.send(getUserCommand);
        
        if (userResult.UserStatus === 'CONFIRMED') {
            console.log('User is already confirmed');
            return {
                statusCode: 200,
                body: JSON.stringify({ message: 'User is already confirmed' }),
            };
        }

        // If not confirmed, proceed with confirmation
        const command = new ConfirmSignUpCommand(params);
        const result = await cognitoClient.send(command);
        console.log('User confirmed successfully. Result:', result);
        return {
            statusCode: 200,
            body: JSON.stringify({
                message: 'User confirmed successfully',
            }),
        };
    } catch (error) {
        console.error('Error confirming user:', error);
        if (error instanceof UserNotFoundException) {
            return {
                statusCode: 404,
                body: JSON.stringify({ message: 'User not found' }),
            };
        } else if (error instanceof CodeMismatchException) {
            return {
                statusCode: 400,
                body: JSON.stringify({ message: 'Invalid confirmation code' }),
            };
        } else if (error instanceof ExpiredCodeException) {
            return {
                statusCode: 400,
                body: JSON.stringify({ message: 'Confirmation code has expired' }),
            };
        } else {
            return {
                statusCode: 500,
                body: JSON.stringify({ message: 'Error confirming user', error: (error as Error).message }),
            };
        }
    }
};
