import { APIGatewayTokenAuthorizerEvent, APIGatewayAuthorizerResult, APIGatewaySimpleAuthorizerWithContextResult } from 'aws-lambda';
import { CognitoIdentityProviderClient, GetUserCommand } from '@aws-sdk/client-cognito-identity-provider';

export const cognitoClient = new CognitoIdentityProviderClient({ region: 'us-east-1' });

export const handler = async (event: APIGatewayTokenAuthorizerEvent): Promise<APIGatewaySimpleAuthorizerWithContextResult> => {
    console.log(`COGNITO_USER_POOL_ID: ${process.env.COGNITO_USER_POOL_ID}`);
    console.log(`Authorizer invoked with event: ${JSON.stringify(event, null, 2)}`);

    // Log all headers if they exist
    const headers = (event as any).headers;
    console.log(`All headers: ${JSON.stringify(headers, null, 2)}`);

    // Check for authorization in different places
    const authHeader = event.authorizationToken || (headers?.Authorization as string) || (headers?.authorization as string);
    console.log(`Authorization header: ${authHeader}`);

    if (!authHeader) {
        console.log('No Authorization header found');
        return generatePolicy('user', 'Deny', event.methodArn);
    }

    const token = authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : authHeader;
    console.log(`Extracted token: ${token}`);

    const userPoolId = process.env.COGNITO_USER_POOL_ID;
    if (!userPoolId) {
        console.log('COGNITO_USER_POOL_ID is not set in environment variables');
        return generatePolicy('user', 'Deny', event.methodArn);
    }

    try {
        console.log('Sending GetUserCommand with token');
        const command = new GetUserCommand({
            AccessToken: token
        });
        const response = await cognitoClient.send(command);

        console.log(`Cognito getUser response: ${JSON.stringify(response, null, 2)}`);
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
        console.log(`User attributes: ${JSON.stringify(userAttributes, null, 2)}`);
        const githubId = userAttributes['custom:github_id'] || '';
        const userWithGithubId = userId + '|' + githubId;
        return generatePolicy(userId, 'Allow', event.methodArn, { 
            userId: userId,
            githubId: githubId
        });
    } catch (error) {
        console.log(`Error in Cognito getUser: ${error}`);
        return generatePolicy('user', 'Deny', event.methodArn);
    }
};

function generatePolicy(principalId: string, effect: 'Allow' | 'Deny', resource: string, context = {}): APIGatewaySimpleAuthorizerWithContextResult {
    console.log(`Generating policy: principalId=${principalId}, effect=${effect}, resource=${resource}, context=${JSON.stringify(context)}`);
    return {
        isAuthorized: effect === 'Allow',
        context: {
            ...context,
            principalId,
            resource
        }
    };
}
