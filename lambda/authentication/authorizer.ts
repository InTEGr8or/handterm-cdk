import { APIGatewayTokenAuthorizerEvent, APIGatewayAuthorizerResult } from 'aws-lambda';
import { CognitoIdentityProviderClient, GetUserCommand } from '@aws-sdk/client-cognito-identity-provider';
import { CloudWatchLogsClient, PutLogEventsCommand } from "@aws-sdk/client-cloudwatch-logs";

export const cognitoClient = new CognitoIdentityProviderClient({ region: 'us-east-1' });
const logsClient = new CloudWatchLogsClient({ region: 'us-east-1' });

const LOG_GROUP_NAME = process.env.LOG_GROUP_NAME || '/handterm/default/AuthorizerFunction';

function log(message: string) {
    const timestamp = new Date().getTime();
    const logEvent = {
        timestamp,
        message: `${timestamp} AuthorizerFunction: ${message}`,
    };

    logsClient.send(new PutLogEventsCommand({
        logGroupName: LOG_GROUP_NAME,
        logStreamName: new Date().toISOString().split('T')[0], // Use date as log stream name
        logEvents: [logEvent],
    })).catch(error => console.error('Error logging to CloudWatch:', error));
}

export const handler = async (event: APIGatewayTokenAuthorizerEvent): Promise<APIGatewayAuthorizerResult> => {
    log(`COGNITO_USER_POOL_ID: ${process.env.COGNITO_USER_POOL_ID}`);
    log(`Authorizer invoked with event: ${JSON.stringify(event, null, 2)}`);

    // Log all headers if they exist
    const headers = (event as any).headers;
    log(`All headers: ${JSON.stringify(headers, null, 2)}`);

    // Check for authorization in different places
    const authHeader = event.authorizationToken || (headers?.Authorization as string) || (headers?.authorization as string);
    log(`Authorization header: ${authHeader}`);

    if (!authHeader) {
        log('No Authorization header found');
        return generatePolicy('user', 'Deny', event.methodArn);
    }

    const token = authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : authHeader;
    log(`Extracted token: ${token}`);

    const userPoolId = process.env.COGNITO_USER_POOL_ID;
    if (!userPoolId) {
        log('COGNITO_USER_POOL_ID is not set in environment variables');
        return generatePolicy('user', 'Deny', event.methodArn);
    }

    try {
        log('Sending GetUserCommand with token');
        const command = new GetUserCommand({
            AccessToken: token
        });
        const response = await cognitoClient.send(command);

        log(`Cognito getUser response: ${JSON.stringify(response, null, 2)}`);
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
        log(`User attributes: ${JSON.stringify(userAttributes, null, 2)}`);
        const githubId = userAttributes['custom:github_id'] || '';
        const userWithGithubId = userId + '|' + githubId;
        return generatePolicy(userId, 'Allow', event.methodArn, { 
            userId: userId,
            githubId: githubId
        });
    } catch (error) {
        log(`Error in Cognito getUser: ${error}`);
        return generatePolicy('user', 'Deny', event.methodArn);
    }
};

function generatePolicy(principalId: string, effect: 'Allow' | 'Deny', resource: string, context = {}): APIGatewayAuthorizerResult {
    log(`Generating policy: principalId=${principalId}, effect=${effect}, resource=${resource}, context=${JSON.stringify(context)}`);
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
