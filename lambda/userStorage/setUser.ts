import * as AWS from 'aws-sdk';

const s3 = new AWS.S3({ region: 'us-east-1' });

export const handler = async (event: any) => {
  try {
    // Assuming event.body contains the data to write, and userId is passed as part of the request
    // For simplicity, not showing the authentication part here
    const userId = event.requestContext.authorizer.lambda.userId;
    if (!userId) {
      return { statusCode: 401, body: JSON.stringify({ message: 'Unauthorized' }) };
    }
    const { profile } = JSON.parse(event.body);
    const objectKey = `user_data/${userId}/_index.md`;

    // Write the content to the S3 object
    await s3.putObject({
      Bucket: 'handterm',
      Key: objectKey,
      Body: profile, // Make sure this is in the correct format (e.g., a string or Buffer)
    }).promise();

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'User data updated successfully' }),
    };
  } catch (err) {
    console.error('Error:', err);
    return { statusCode: 500, body: JSON.stringify(err) };
  }
};