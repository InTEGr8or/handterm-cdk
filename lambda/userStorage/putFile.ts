// cdk/lambda/userStorage/putFile.ts
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const s3Client = new S3Client({ region: "us-east-1" });
const bucketName = process.env.BUCKET_NAME;

export const handler = async (event: any) => {
    const body = JSON.parse(event.body);
    const key = body.key;
    const extension = body.extension || 'json';
    const userId = event.requestContext.authorizer.lambda.userId;
    const content = body.content;
    console.log('key:', key, 'extension:', extension, 'userId:', userId, 'content:', content, 'body:', event.body);
    if (!userId) {
        return { statusCode: 401, body: JSON.stringify({ message: 'Unauthorized. userId not found.' }) };
    }
    if(!key){
        return { statusCode: 404, body: JSON.stringify({ message: 'Key not found.' }) };
    }
    if(!content){
        return { statusCode: 400, body: JSON.stringify({ message: 'Content not found.' }) };
    }

    const objectKey = `user_data/${userId}/${key}.${extension}`;

    try {
        const command = new PutObjectCommand({
            Bucket: bucketName,
            Key: objectKey,
            Body: content,
        });
        await s3Client.send(command);

        return { statusCode: 200, body: JSON.stringify({ message: `File ${key} saved` }) };
    } catch (err) {
        console.log('Error:', err);
        return { statusCode: 500, body: JSON.stringify(err) };
    }
}
