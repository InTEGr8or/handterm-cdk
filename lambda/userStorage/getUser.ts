
import * as AWS from 'aws-sdk';

const s3 = new AWS.S3({ region: 'us-east-1' });

export const handler = async (event: any) => {
    console.log('GetUserFunction invoked');
    console.log('Event:', JSON.stringify(event, null, 2));
    
    try {
        if (!event.requestContext) {
            console.error('No requestContext in event');
            return {
                statusCode: 400,
                body: JSON.stringify({ message: 'Invalid request structure: No requestContext' }),
            };
        }

        console.log('RequestContext:', JSON.stringify(event.requestContext, null, 2));

        if (!event.requestContext.authorizer) {
            console.error('No authorizer in requestContext');
            return {
                statusCode: 400,
                body: JSON.stringify({ message: 'Invalid request structure: No authorizer' }),
            };
        }

        console.log('Authorizer:', JSON.stringify(event.requestContext.authorizer, null, 2));

        if (!event.requestContext.authorizer.lambda) {
            console.error('No lambda in authorizer');
            return {
                statusCode: 400,
                body: JSON.stringify({ message: 'Invalid request structure: No lambda in authorizer' }),
            };
        }

        const userId = event.requestContext.authorizer.lambda.userId;
        if (!userId) {
            console.error('No userId in lambda authorizer');
            return {
                statusCode: 401,
                body: JSON.stringify({ message: 'User is not authenticated' }),
            };
        }

        console.log('UserId:', userId);

        const objectKey = `user_data/${userId}/_index.md`;
        console.log('objectKey:', objectKey);

        try {
            console.log('Attempting to check if object exists');
            await s3.headObject({
                Bucket: 'handterm',
                Key: objectKey
            }).promise();

            console.log('Object exists, proceeding to get object');
            const s3Response = await s3.getObject({
                Bucket: 'handterm',
                Key: objectKey
            }).promise();

            const fileContent = s3Response.Body?.toString('utf-8');
            console.log('File content retrieved:', fileContent);

            console.log('GetUserFunction completed successfully');
            return {
                statusCode: 200,
                body: JSON.stringify({ userId: userId, content: fileContent }),
            };
        } catch (headErr: unknown) {
            const error = headErr as AWS.AWSError;

            if (error.code === 'NoSuchKey') {
                console.log('Profile does not exist yet for userId:', userId);
                return {
                    statusCode: 404,
                    body: JSON.stringify({ message: 'Profile does not exist yet' }),
                };
            } else {
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
    } finally {
        console.log('GetUserFunction ended');
    }
};
