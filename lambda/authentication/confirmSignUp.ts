import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { CognitoIdentityProviderClient, ConfirmSignUpCommand } from "@aws-sdk/client-cognito-identity-provider";

const cognitoClient = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION });

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    if (!event.body) {
        return { statusCode: 400, body: JSON.stringify({ message: 'Invalid request body' }) };
    }

    const { username, confirmationCode } = JSON.parse(event.body);

    if (!username || !confirmationCode) {
        return { statusCode: 400, body: JSON.stringify({ message: 'Missing required fields' }) };
    }

    const params = {
        ClientId: process.env.COGNITO_APP_CLIENT_ID,
        Username: username,
        ConfirmationCode: confirmationCode,
    };

    try {
        const command = new ConfirmSignUpCommand(params);
        await cognitoClient.send(command);
        return {
            statusCode: 200,
            body: JSON.stringify({
                message: 'User confirmed successfully',
            }),
        };
    } catch (error) {
        console.error('Error confirming user:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ message: 'Error confirming user', error: (error as Error).message }),
        };
    }
};
