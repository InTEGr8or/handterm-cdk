// cdk/lambda/authentication/checkConnection.ts

import * as AWS from 'aws-sdk';

const s3 = new AWS.S3({ region: 'us-east-1' });

export const handler = async (event: any) => {
    try {
        console.log('Received event:', JSON.stringify(event, null, 2));
        
        if (!event.requestContext || !event.requestContext.authorizer || !event.requestContext.authorizer.lambda) {
            console.error('Invalid event structure:', JSON.stringify(event, null, 2));
            return {
                statusCode: 400,
                body: JSON.stringify({ message: 'Invalid request structure' }),
            };
        }

        const userId = event.requestContext.authorizer.lambda.userId;
        if (!userId) {
            console.error('User is not authenticated. Event:', JSON.stringify(event, null, 2));
            return {
                statusCode: 401,
                body: JSON.stringify({ message: 'User is not authenticated' }),
            };
        }

        const objectKey = `user_data/${userId}/_index.md`;
        console.log('objectKey:', objectKey);

        try {
            await s3.headObject({
                Bucket: 'handterm',
                Key: objectKey
            }).promise();

            // If headObject succeeds, the object exists, and you can proceed to get the object
            const s3Response = await s3.getObject({
                Bucket: 'handterm',
                Key: objectKey
            }).promise();

            const fileContent = s3Response.Body?.toString('utf-8');
            console.log('fileContent: ', fileContent);

            return {
                statusCode: 200,
                body: JSON.stringify({ userId: userId, content: fileContent }),
            };
        } catch (headErr: unknown) {
            // First, assert headErr as an AWS error with a code property
            const error = headErr as AWS.AWSError;

            if (error.code === 'NoSuchKey') {
                // Handle the NoSuchKey error case
                console.log('Profile does not exist yet for userId:', userId);
                return {
                    statusCode: 404,
                    body: JSON.stringify({ message: 'Profile does not exist yet' }),
                };
            } else {
                // If it's a different kind of error, log and handle it
                console.error('S3 error:', JSON.stringify(error, null, 2));
                return {
                    statusCode: 500,
                    body: JSON.stringify({ message: 'S3 Object Error', error: error.message }),
                };
            }
        }
    } catch (err) {
        console.error('Unexpected error:', JSON.stringify(err, null, 2));
        return { 
            statusCode: 500, 
            body: JSON.stringify({ message: 'Internal Server Error', error: (err as Error).message }) 
        };
    }
};
