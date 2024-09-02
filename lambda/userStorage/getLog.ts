// cdk/lambda/userStorage/getLog.ts

import { S3Client, GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';

const s3 = new S3Client({ region: 'us-east-1' });

export const handler = async (event: any) => {
    const authorizer = event.requestContext.authorizer;
    const userId = authorizer.lambda.userId;
    const logDomain = event.queryStringParameters.key || '';
    const limit = event.queryStringParameters.limit || 10;
    const bucketName = process.env.BUCKET_NAME;
    console.log('getLog received userId:', userId, 'logDomain:', event.queryStringParameters);
    if (!userId) {
        return { statusCode: 401, body: JSON.stringify({ message: 'Unauthorized' }) };
    }

    try {
        console.log('userId:', userId, 'logDomain:', logDomain);
        const listCommand = new ListObjectsV2Command({
            Bucket: bucketName,
            Prefix: `user_data/${userId}/logs/${logDomain}`
        });
        const listedObjects = await s3.send(listCommand);

        // Ensure items have a key before sorting
        const sortedKeys = (listedObjects.Contents || [])
            .filter((item): item is { Key: string } => item.Key !== undefined) // Filter out items without a Key
            .sort((a, b) => {
                // Assuming both a.Key and b.Key exist due to filter above
                const timeA = parseInt(a.Key!.split('/').pop() || '0', 10);
                const timeB = parseInt(b.Key!.split('/').pop() || '0', 10);
                return timeB - timeA; // Sort in descending order
            })
            .slice(0, limit); // Get the most recent 5 keys

        console.log('sortedKeys:', sortedKeys);
        // Proceed with the rest of your code...

        const contents = await Promise.all(
            sortedKeys.map(async (keyItem) => {
                // Key existence is guaranteed by the filter, but TypeScript doesn't infer this
                const getCommand = new GetObjectCommand({
                    Bucket: bucketName,
                    Key: keyItem.Key!,
                });
                const s3Response = await s3.send(getCommand);
                return await s3Response.Body?.transformToString();
            })
        );
        console.log('contents:', contents);

        return { statusCode: 200, body: JSON.stringify(contents) };
    } catch (err) {
        console.error('Error:', err);
        return { statusCode: 500, body: JSON.stringify(err) };
    }
};
