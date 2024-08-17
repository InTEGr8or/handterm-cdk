// cdk/lambda/userStorage/getLog.ts

import * as AWS from 'aws-sdk';
const s3 = new AWS.S3();

exports.handler = async (event: any) => {
    const authorizer = event.requestContext.authorizer;
    const userId = authorizer.lambda.userId;
    const logDomain = event.queryStringParameters.key || '';
    const limit = event.queryStringParameters.limit || 10;
    const bucketName = 'handterm';
    console.log('getLog received userId:', userId, 'logDomain:', event.queryStringParameters);
    if (!userId) {
        return { statusCode: 401, body: JSON.stringify({ message: 'Unauthorized' }) };
    }

    try {
        console.log('userId:', userId, 'logDomain:', logDomain);
        const listedObjects = await s3.listObjectsV2({
            Bucket: bucketName,
            Prefix: `user_data/${userId}/logs/${logDomain}`
        }).promise();

        // Ensure items have a key before sorting
        const sortedKeys = (listedObjects.Contents || [])
            .filter((item) => item.Key !== undefined) // Filter out items without a Key
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
                const s3Response = await s3.getObject({
                    Bucket: bucketName,
                    Key: keyItem.Key!,
                }).promise();
                return s3Response.Body?.toString('utf-8');
            })
        );
        console.log('contents:', contents);

        return { statusCode: 200, body: JSON.stringify( contents ) };
    } catch (err) {
        console.error('Error:', err);
        return { statusCode: 500, body: JSON.stringify(err) };
    }
};