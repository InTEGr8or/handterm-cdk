// cdk/lambda/userStorage/getFile.ts

import { S3Client, HeadObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";

const bucketName = process.env.BUCKET_NAME;

const s3Client = new S3Client({ region: process.env.AWS_REGION });

export const handler = async (event: any) => {

    console.log('Get file event', event.queryStringParameters);
    const { key, extension } = event.queryStringParameters;
    console.log('key:', key, 'extension:', extension, 'event:');
    const userId = event.requestContext.authorizer.lambda.userId;
    if (!userId) {
        return { statusCode: 401, body: JSON.stringify({ message: 'Unauthorized. userId not found.' }) };
    }
    if(!key){
        return { statusCode: 404, body: JSON.stringify({ message: 'Key not found.' }) };
    }
    if(!extension){
        return { statusCode: 400, body: JSON.stringify({ message: 'Extension not found.' }) };
    }
    const objectKey = `user_data/${userId}/${key}.${extension}`;
    // Check if the file exists
    try{
        await s3Client.send(new HeadObjectCommand({
            Bucket: bucketName,
            Key: objectKey
        }));
    }catch(err){
        console.error('Error:', err);
        return {
            statusCode: 404,
            body: JSON.stringify({ message: 'File not found' }),
        };
    }

    const s3Response = await s3Client.send(new GetObjectCommand({
        Bucket: bucketName,
        Key: objectKey
    }));

    const fileContent = await s3Response.Body?.transformToString('utf-8');

    console.log('fileContent: ', fileContent);
    return {
        statusCode: 200,
        body: fileContent
    };
}
