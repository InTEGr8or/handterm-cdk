
import { S3Client, GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { ENDPOINTS } from '../cdkshared/endpoints';

const s3Client = new S3Client({ region: 'us-east-1' });
const bucketName = process.env.BUCKET_NAME || 'handterm';

console.log('Loading function');

export const handler = async (event: any) => {
    console.log('GetUserFunction invoked');
    console.log('Event:', JSON.stringify(event, null, 2));
    
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
        if (event.requestContext.authorizer) {
            console.log('Full event:', JSON.stringify(event, null, 2));
            console.log('Authorizer found:', JSON.stringify(event.requestContext.authorizer, null, 2));
        
            // The authorizer context is now directly in event.requestContext.authorizer
            userId = event.requestContext.authorizer.userId;
            githubId = event.requestContext.authorizer.github_id;

            console.log('UserId from authorizer:', userId);
            console.log('GitHub ID from authorizer:', githubId);

            // Log each property of the authorizer separately
            for (const [key, value] of Object.entries(event.requestContext.authorizer)) {
                console.log(`Authorizer property ${key}:`, JSON.stringify(value));
            }
        } else {
            console.log('No authorizer in requestContext, checking headers');
            // If no authorizer, check if userId is passed in headers (for testing purposes)
            userId = event.headers['x-user-id'];
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

        if (!githubId || !githubToken) {
            console.log('GitHub ID or Token not found in authorizer context, checking userAttributes');
            githubId = userAttributes?.['custom:github_id'];
            githubToken = userAttributes?.['custom:github_token'];
        }
        if (!userId) {
            console.error('No userId found in request');
            return {
                statusCode: 401,
                body: JSON.stringify({ message: 'User is not authenticated' }),
            };
        }

        const objectKey = `user_data/${userId}/_index.md`;
        console.log('objectKey:', objectKey);
        console.log('BUCKET_NAME:', bucketName);

        try {
            console.log('Attempting to check if object exists');
            const headCommand = new HeadObjectCommand({
                Bucket: bucketName,
                Key: objectKey
            });
            const headResult = await s3Client.send(headCommand);
            console.log('Head object result:', JSON.stringify(headResult, null, 2));

            console.log('Object exists, proceeding to get object');
            const getCommand = new GetObjectCommand({
                Bucket: bucketName,
                Key: objectKey
            });
            const s3Response = await s3Client.send(getCommand);

            const fileContent = await s3Response.Body?.transformToString();
            console.log('File content retrieved:', fileContent);

            console.log('GetUserFunction completed successfully');
            return {
                statusCode: 200,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Credentials': true,
                },
                body: JSON.stringify({ 
                    userId: userId, 
                    userAttributes: userAttributes, 
                    content: fileContent,
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
                    headers: {
                        'Access-Control-Allow-Origin': '*',
                        'Access-Control-Allow-Credentials': true,
                    },
                    body: JSON.stringify({ userId: userId, content: null, message: 'Profile does not exist yet' }),
                };
            } else {
                console.error('S3 error:', JSON.stringify(error, null, 2));
                return {
                    statusCode: 500,
                    headers: {
                        'Access-Control-Allow-Origin': '*',
                        'Access-Control-Allow-Credentials': true,
                    },
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
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Credentials': true,
            },
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
