
import * as AWS from 'aws-sdk';

const s3 = new AWS.S3({ region: 'us-east-1' });

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

        let userId;

        // Check if the authorizer is present
        if (event.requestContext.authorizer) {
            console.log('Authorizer found:', JSON.stringify(event.requestContext.authorizer, null, 2));
            
            // Check if lambda is present in the authorizer
            if (event.requestContext.authorizer.lambda) {
                userId = event.requestContext.authorizer.lambda.userId;
            } else {
                console.log('No lambda in authorizer, checking for userId directly');
                userId = event.requestContext.authorizer.userId;
            }
        } else {
            console.log('No authorizer in requestContext, checking headers');
            // If no authorizer, check if userId is passed in headers (for testing purposes)
            userId = event.headers['x-user-id'];
        }

        console.log('UserId:', userId);
        if (!userId) {
            console.error('No userId found in request');
            return {
                statusCode: 401,
                body: JSON.stringify({ message: 'User is not authenticated' }),
            };
        }

        const objectKey = `user_data/${userId}/_index.md`;
        console.log('objectKey:', objectKey);

        try {
            console.log('Attempting to check if object exists');
            await s3.headObject({
                Bucket: process.env.BUCKET_NAME || 'handterm',
                Key: objectKey
            }).promise();

            console.log('Object exists, proceeding to get object');
            const s3Response = await s3.getObject({
                Bucket: process.env.BUCKET_NAME || 'handterm',
                Key: objectKey
            }).promise();

            const fileContent = s3Response.Body?.toString('utf-8');
            console.log('File content retrieved:', fileContent);

            console.log('GetUserFunction completed successfully');
            return {
                statusCode: 200,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Credentials': true,
                },
                body: JSON.stringify({ userId: userId, content: fileContent }),
            };
        } catch (err: unknown) {
            const error = err as AWS.AWSError;

            if (error.code === 'NoSuchKey' || error.code === 'NotFound') {
                console.log('Profile does not exist yet for userId:', userId);
                return {
                    statusCode: 200,  // Changed from 404 to 200
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
                    body: JSON.stringify({ message: 'S3 Object Error', error: error.message }),
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
            body: JSON.stringify({ message: 'Internal Server Error', error: (err as Error).message }) 
        };
    } finally {
        console.log('GetUserFunction ended');
    }
};
