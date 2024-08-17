import { APIGatewayTokenAuthorizerEvent, APIGatewayAuthorizerResult, StatementEffect } from 'aws-lambda';
import { CognitoIdentityServiceProvider } from 'aws-sdk';

const cognito = new CognitoIdentityServiceProvider();

export const handler = async (event: APIGatewayTokenAuthorizerEvent): Promise<APIGatewayAuthorizerResult> => {
    const token = event.authorizationToken.split("Bearer ")[1];
    const userPoolId = process.env.COGNITO_USER_POOL_ID;

    try {
        const response = await cognito.getUser({
            AccessToken: token
        }).promise();

        console.log('Response:', response);
        const userId = response.Username;

        return generatePolicy(userId, 'Allow', event.methodArn, { userId });
    } catch (error) {
        console.error(error);
        return generatePolicy('user', 'Deny', event.methodArn);
    }
};

function generatePolicy(principalId: string, effect: StatementEffect, resource: string, context = {}): APIGatewayAuthorizerResult {
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