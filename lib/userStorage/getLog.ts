import { S3Client, GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { ENDPOINTS } from '../cdkshared/endpoints';

const s3 = new S3Client({ region: 'us-east-1' });

export const handler = async (event: any) => {
    const authorizer = event.requestContext.authorizer;
    const userId = authorizer.lambda.userId;
    const logDomain = event.queryStringParameters.key || '';
    const limit = parseInt(event.queryStringParameters.limit || '10', 10);
    const bucketName = ENDPOINTS.aws.s3.bucketName;

    console.log('getLog received userId:', userId, 'logDomain:', logDomain, 'limit:', limit);

    if (!userId) {
        return { statusCode: 401, body: JSON.stringify({ message: 'Unauthorized' }) };
    }

    try {
        const listCommand = new ListObjectsV2Command({
            Bucket: bucketName,
            Prefix: `user_data/${userId}/logs/${logDomain}`,
            MaxKeys: limit
        });
        const listedObjects = await s3.send(listCommand);

        const sortedKeys = (listedObjects.Contents || [])
            .filter((item): item is { Key: string } => item.Key !== undefined)
            .sort((a, b) => {
                const timeA = parseInt(a.Key.split('/').pop() || '0', 10);
                const timeB = parseInt(b.Key.split('/').pop() || '0', 10);
                return timeB - timeA;
            });

        console.log('sortedKeys:', sortedKeys);

        const contents = await Promise.all(
            sortedKeys.map(async (keyItem) => {
                const getCommand = new GetObjectCommand({
                    Bucket: bucketName,
                    Key: keyItem.Key,
                });
                const s3Response = await s3.send(getCommand);
                return await s3Response.Body?.transformToString();
            })
        );

        console.log('contents:', contents);

        return { 
            statusCode: 200, 
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Credentials': true,
            },
            body: JSON.stringify(contents) 
        };
    } catch (err) {
        console.error('Error:', err);
        return { 
            statusCode: 500, 
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Credentials': true,
            },
            body: JSON.stringify({ message: 'Internal server error' }) 
        };
    }
};
