import { APIGatewayTokenAuthorizerEvent, APIGatewaySimpleAuthorizerWithContextResult } from 'aws-lambda';
import { CognitoIdentityProviderClient, GetUserCommand } from '@aws-sdk/client-cognito-identity-provider';
import { CognitoAttribute } from './githubUtils.js';

export const cognitoClient = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION });

interface ExtendedAPIGatewayTokenAuthorizerEvent extends APIGatewayTokenAuthorizerEvent {
    identitySource?: string[];
}

export const handler = async (event: ExtendedAPIGatewayTokenAuthorizerEvent): Promise<APIGatewaySimpleAuthorizerWithContextResult<{ [key: string]: string }>> => {
    console.log(`Authorizer invoked with event: ${event}`);

    const authToken = event.identitySource?.[0];
    console.log(`Authorization token: ${authToken}`);

    if (!authToken || !authToken.startsWith('Bearer ')) {
        console.log('No valid Authorization token found');
        return generatePolicy('user', 'Deny', event.methodArn);
    }

    const token = authToken.split(' ')[1];

    const userPoolId = process.env.COGNITO_USER_POOL_ID;
    if (!userPoolId) {
        console.error('COGNITO_USER_POOL_ID is not set in environment variables');
        return generatePolicy('user', 'Deny', event.methodArn);
    }

    try {
        const command = new GetUserCommand({ AccessToken: token });
        const response = await cognitoClient.send(command);

        const userId = response.Username;
        if (!userId) {
            throw new Error('UserId not found in Cognito response');
        }

        const userAttributes = response.UserAttributes?.reduce((acc, attr) => {
            if (attr.Name && attr.Value) {
                acc[attr.Name] = attr.Value;
            }
            return acc;
        }, {} as Record<string, string>) ?? {};

        const githubId = userAttributes[CognitoAttribute.GH_ID] || '';
        const githubToken = userAttributes[CognitoAttribute.GH_TOKEN] || '';
        return generatePolicy(userId, 'Allow', event.methodArn, {
            userId,
            githubId,
            githubToken
        });
    } catch (error) {
        console.error(`Error in Cognito getUser: ${error}`);
        return generatePolicy('user', 'Deny', event.methodArn);
    }
};

function generatePolicy(principalId: string, effect: 'Allow' | 'Deny', resource: string, context = {}): APIGatewaySimpleAuthorizerWithContextResult<{ [key: string]: string }> {
    return {
        isAuthorized: effect === 'Allow',
        context: {
            ...context,
            principalId,
            resource
        }
    };
}
