// cdk/lambda/userStorage/getFile.ts
import { APIGatewayProxyHandler } from 'aws-lambda';
import { S3Client, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';

const s3Client = new S3Client({ region: process.env.AWS_REGION });
const bucketName = process.env.BUCKET_NAME;

export const handler: APIGatewayProxyHandler = async (event) => {
  console.log('GetFile Lambda function invoked', JSON.stringify(event, null, 2));

  const { key, extension } = event.queryStringParameters || {};
  const userId = event.requestContext.authorizer?.lambda?.userId;

  if (!userId) {
    return { statusCode: 401, body: JSON.stringify({ message: 'Unauthorized. userId not found.' }) };
  }

  if (!key || !extension) {
    return { statusCode: 400, body: JSON.stringify({ message: 'Missing key or extension parameter' }) };
  }

  if (!bucketName) {
    console.error('BUCKET_NAME environment variable is not set');
    return { statusCode: 500, body: JSON.stringify({ message: 'Internal server error' }) };
  }

  const objectKey = `user_data/${userId}/${key}.${extension}`;

  try {
    // Check if the file exists
    await s3Client.send(new HeadObjectCommand({
      Bucket: bucketName,
      Key: objectKey
    }));

    const response = await s3Client.send(new GetObjectCommand({
      Bucket: bucketName,
      Key: objectKey
    }));

    const fileContent = await response.Body?.transformToString('utf-8');

    if (!fileContent) {
      return { statusCode: 404, body: JSON.stringify({ message: 'File not found' }) };
    }

    console.log('fileContent: ', fileContent);
    return { statusCode: 200, body: JSON.stringify({ content: fileContent }) };
  } catch (error) {
    console.error('Error retrieving file from S3:', error);
    if ((error as any).name === 'NoSuchKey' || (error as any).name === 'NotFound') {
      return { statusCode: 404, body: JSON.stringify({ message: 'File not found' }) };
    }
    return { statusCode: 500, body: JSON.stringify({ message: 'Error retrieving file' }) };
  }
};
