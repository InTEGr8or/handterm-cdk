// cdk/lambda/userStorage/putFile.ts

import * as AWS from 'aws-sdk';

const s3 = new AWS.S3();
const bucketName = "handterm";

exports.handler = async (event: any) => {
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
        await s3.putObject({
            Bucket: bucketName,
            Key: objectKey,
            Body: content,
        }).promise();

        return { statusCode: 200, body: JSON.stringify({ message: `File ${key} saved` }) };
    } catch (err) {
        console.log('Error:', err);
        return { statusCode: 500, body: JSON.stringify(err) };
    }
}