import { APIGatewayTokenAuthorizerEvent, APIGatewayAuthorizerResult } from 'aws-lambda';
import { CognitoIdentityProviderClient, GetUserCommand } from '@aws-sdk/client-cognito-identity-provider';

export const cognitoClient = new CognitoIdentityProviderClient({ region: 'us-east-1' });

export const handler = async (event: APIGatewayTokenAuthorizerEvent): Promise<APIGatewayAuthorizerResult> => {
    console.log('COGNITO_USER_POOL_ID:', process.env.COGNITO_USER_POOL_ID);
    console.log('Authorizer invoked with event:', JSON.stringify(event, null, 2));

    const authHeader = event.authorizationToken;
    console.log('Authorization header:', authHeader);

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        console.log('Invalid Authorization header');
        return generatePolicy('user', 'Deny', event.methodArn);
    }

    const token = authHeader.split(' ')[1];
    console.log('Extracted token:', token);

    const userPoolId = process.env.COGNITO_USER_POOL_ID;
    if (!userPoolId) {
        console.error('COGNITO_USER_POOL_ID is not set in environment variables');
        return generatePolicy('user', 'Deny', event.methodArn);
    }

    try {
        const command = new GetUserCommand({
            AccessToken: token
        });
        const response = await cognitoClient.send(command);

        console.log('Cognito getUser response:', JSON.stringify(response, null, 2));
        const userId = response.Username;

        if (!userId) {
            throw new Error('UserId not found in Cognito response');
        }
        const userAttributes = response.UserAttributes ? JSON.stringify(response.UserAttributes) : '{}';
        console.log('User attributes:', userAttributes);

        return generatePolicy(userId, 'Allow', event.methodArn, { userId, userAttributes });
    } catch (error) {
        console.error('Error in Cognito getUser:', error);
        return generatePolicy('user', 'Deny', event.methodArn);
    }
};

function generatePolicy(principalId: string, effect: 'Allow' | 'Deny', resource: string, context = {}): APIGatewayAuthorizerResult {
    console.log(`Generating policy: principalId=${principalId}, effect=${effect}, resource=${resource}, context=${JSON.stringify(context)}`);
    return {
        principalId,
        policyDocument: {
            Version: '2012-10-17',
            Statement: [{
                Action: 'execute-api:Invoke',
                Effect: effect,
                Resource: resource
            }]
        },
        context,
    };
}
