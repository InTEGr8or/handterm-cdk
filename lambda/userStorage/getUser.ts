
import { S3Client, GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { CognitoAttribute } from "../authentication/githubUtils";

console.log('Loading function');

export const handler = async (event: any) => {
    console.log('GetUserFunction invoked');
    console.log('Event:', JSON.stringify(event, null, 2));
    console.log('Environment variables:', JSON.stringify(process.env, null, 2));

    const s3Client = new S3Client({ region: "us-east-1" });
    const bucketName = process.env.BUCKET_NAME;

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

        console.log('UserId:', userId);
        console.log('UserAttributes (raw):', userAttributes);
        console.log('GitHub ID:', githubId);
        console.log('GitHub Token:', githubToken ? '[REDACTED]' : 'Not found');

        // Parse userAttributes if it's a string
        if (typeof userAttributes === 'string') {
            try {
                userAttributes = JSON.parse(userAttributes);
            } catch (error) {
                console.error('Error parsing userAttributes:', error);
            }
        }

        console.log('UserAttributes (parsed):', JSON.stringify(userAttributes, null, 2));

        if (!userId) {
            console.error('No userId found in request');
            return {
                statusCode: 401,
                body: JSON.stringify({ message: 'User is not authenticated' }),
            };
        }

        try {
            console.log('GetUserFunction completed successfully');
            return {
                statusCode: 200,
                body: JSON.stringify({
                    userId: userId,
                    userAttributes: userAttributes,
                    githubId: githubId,
                    githubToken: githubToken ? '[REDACTED]' : null
                }),
            };
        } catch (err: unknown) {
            const error = err as Error & { name?: string, code?: string };
            console.error('S3 operation error:', JSON.stringify(error, null, 2));

            if (error.name === 'NoSuchKey' || error.code === 'NotFound') {
                console.log('Profile does not exist yet for userId:', userId);
                return {
                    statusCode: 200,
                    body: JSON.stringify({ userId: userId, content: null, message: 'Profile does not exist yet' }),
                };
            } else {
                console.error('S3 error:', JSON.stringify(error, null, 2));
                return {
                    statusCode: 500,
                    body: JSON.stringify({
                        message: 'S3 Object Error',
                        error: error.message,
                        stack: error.stack,
                        code: error.code,
                        name: error.name
                    }),
                };
            }
        }
    } catch (err) {
        console.error('Unexpected error:', JSON.stringify(err, null, 2));
        return {
            statusCode: 500,
            body: JSON.stringify({
                message: 'Internal Server Error',
                error: (err as Error).message,
                stack: (err as Error).stack,
                code: (err as any).code,
                name: (err as Error).name
            }),
        };
    } finally {
        console.log('GetUserFunction ended');
    }
};
