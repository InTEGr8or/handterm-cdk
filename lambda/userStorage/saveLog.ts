import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const s3Client = new S3Client({ region: process.env.AWS_REGION });

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    // Add null checks and provide a fallback
    const userId = event.requestContext?.authorizer?.lambda?.userId || 'unknown-user';

    try {
        const body = JSON.parse(event.body || '{}');

        if (!body.log) {
            return {
                statusCode: 400,
                body: JSON.stringify({ message: 'No log data provided' })
            };
        }

        const logKey = `user-logs/${userId}/${Date.now()}.json`;

        const params = {
            Bucket: process.env.BUCKET_NAME || '',
            Key: logKey,
            Body: JSON.stringify(body.log),
            ContentType: 'application/json'
        };

        // Add additional error checking for environment variables
        if (!params.Bucket) {
            return {
                statusCode: 500,
                body: JSON.stringify({ message: 'Bucket name not configured' })
            };
        }

        await s3Client.send(new PutObjectCommand(params));

        return {
            statusCode: 200,
            body: JSON.stringify({
                message: 'Log saved successfully',
                logKey
            })
        };
    } catch (error) {
        console.error('Error saving log:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({
                message: 'Failed to save log',
                error: error instanceof Error ? error.message : 'Unknown error'
            })
        };
    }
};

// For CommonJS compatibility
module.exports = { handler };
