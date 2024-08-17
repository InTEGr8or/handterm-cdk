// cdk/lambda/authentication/checkConnection.ts

import * as AWS from 'aws-sdk';

const s3 = new AWS.S3({ region: 'us-east-1' });

export const handler = async (event: any) => {
    try {

        console.log('event:', event, 'userId:', event.requestContext.authorizer);
        const userId = event.requestContext.authorizer.lambda.userId;
        if (!userId) {
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
                return {
                    statusCode: 404,
                    body: JSON.stringify({ message: 'Profile does not exist yet' }),
                };
            } else {
                // If it's a different kind of error, you might want to log or handle it differently
                console.error('S3 headObject error:', error);
                return {
                    statusCode: 500,
                    body: JSON.stringify({ message: 'S# Head Object Error' }),
                };
            }
        }
    } catch (err) {
        console.error('Error:', err);
        return { statusCode: 500, body: JSON.stringify(err) };
    }
};