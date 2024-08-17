
import * as AWS from 'aws-sdk';
import { ENDPOINTS } from '../cdkshared/endpoints';
const s3 = new AWS.S3();

exports.handler = async (event: any) => {
    console.log('event:', event, 'userId:', event.requestContext.authorizer.userId);
    const userId = event.requestContext.authorizer.lambda.userId;
    if (!userId) {
        return { statusCode: 401, body: JSON.stringify({ message: 'Unauthorized' }) };
    }
    const bucketName = ENDPOINTS.aws.s3.bucketName;
    const body = JSON.parse(event.body);
    const logDomain = body.logDomain;
    const limit = body.limit || 10;
    try {
        const { Contents } = await s3.listObjectsV2({
            Bucket: bucketName,
            Prefix: `user_data/${userId}/logs/${logDomain}`,
        }).promise();

        if (!Contents) {
            return { statusCode: 404, body: JSON.stringify({ message: "No logs found." }) };
        }

        // Extract keys, ensure they are defined, and sort them
        const sortedKeys = Contents.map(content => content.Key)
            .filter((key): key is string => key !== undefined) // This line ensures 'key' is treated as 'string'
            .sort((a, b) => b.localeCompare(a)); // TypeScript now understands 'a' and 'b' are strings

        // Slice the array to get the top 10 most recent keys
        const recentKeys = sortedKeys.slice(0, limit);

        // Optionally, if you need to fetch the object details for these keys, you can do so here

        return { statusCode: 200, body: JSON.stringify({ body: recentKeys }) };
    } catch (err) {
        console.error('Error listing logs:', err);
        return { statusCode: 500, body: JSON.stringify(err) };
    }
};