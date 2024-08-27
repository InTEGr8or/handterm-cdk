import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const s3Client = new S3Client({ region: 'us-east-1' });

export const handler = async (event: any) => {
  try {
    const userId = event.requestContext.authorizer.lambda.userId;
    if (!userId) {
      return { statusCode: 401, body: JSON.stringify({ message: 'Unauthorized' }) };
    }
    const { profile } = JSON.parse(event.body);
    const objectKey = `user_data/${userId}/_index.md`;

    const command = new PutObjectCommand({
      Bucket: 'handterm',
      Key: objectKey,
      Body: profile, // Make sure this is in the correct format (e.g., a string or Buffer)
    });

    await s3Client.send(command);

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'User data updated successfully' }),
    };
  } catch (err) {
    console.error('Error:', err);
    return { statusCode: 500, body: JSON.stringify(err) };
  }
};
