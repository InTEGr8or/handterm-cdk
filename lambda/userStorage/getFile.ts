// cdk/lambda/userStorage/getFile.ts

import * as AWS from 'aws-sdk';

const s3 = new AWS.S3({ region: 'us-east-1' });

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
        await s3.headObject({
            Bucket: 'handterm',
            Key: objectKey
        }).promise();
    }catch(err){
        console.error('Error:', err);
        return {
            statusCode: 404,
            body: JSON.stringify({ message: 'File not found' }),
        };
    }

    const s3Response = await s3.getObject({
        Bucket: 'handterm',
        Key: objectKey
    }).promise();

    const fileContent = s3Response.Body?.toString('utf-8');

    console.log('fileContent: ', fileContent);
    return {
        statusCode: 200,
        body: fileContent
    };
}