// cdk/lambda/userStorage/saveLog.ts
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { ENDPOINTS } from '../cdkshared/endpoints';

const s3Client = new S3Client({ region: "us-east-1" });

let domain = 'logs';
const bucketName = ENDPOINTS.aws.s3.bucketName;

export const handler = async (event: any) => {
    const userId = event.requestContext.authorizer.lambda.userId;
    if (!userId) {
        return { statusCode: 401, body: JSON.stringify({ message: 'Unauthorized. userId not found.' }) };
    }
    const { key, content, extension } = JSON.parse(event.body); // Example payload
    console.log('saveLog called with userId:', userId, 'key:', key, 'extension:', extension);

    const fileExtension = extension || 'json';
    if (key.match(/@\w*/)) {
        domain = key.split(' ')[0].replace('@', '');
    }
    // TODO: replace('_', '/') to partition by folder, which is S3-optimal.
    const contentKey = content.slice(0, 200).toLowerCase().replace(/\s/g, '_').replace(/[^a-zA-Z0-9\/_]/g, '');
    let keyPath = `user_data/${userId}/${domain}/${key.replace(/(l\d{4})-(\d{2})-(\d{2})/g, '$1/$2/$3').replace('_', '/')}_${contentKey}.${fileExtension}`;

    try {
        const command = new PutObjectCommand({
            Bucket: bucketName,
            Key: keyPath,
            Body: content,
        });
        await s3Client.send(command);

        return { statusCode: 200, body: JSON.stringify({ message: 'Log saved' }) };
    } catch (err) {
        console.log('Error:', err);
        return { statusCode: 500, body: JSON.stringify(err) };
    }
};
