
import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { ENDPOINTS } from '../cdkshared/endpoints';

const s3Client = new S3Client({ region: "us-east-1" });

export const handler = async (event: any) => {
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
        const command = new ListObjectsV2Command({
            Bucket: bucketName,
            Prefix: `user_data/${userId}/logs/${logDomain}`,
        });
        const { Contents } = await s3Client.send(command);

        if (!Contents) {
            return { statusCode: 404, body: JSON.stringify({ message: "No logs found." }) };
        }

        // Extract keys, ensure they are defined, and sort them
        const sortedKeys = Contents.map(content => content.Key)
            .filter((key): key is string => key !== undefined)
            .sort((a, b) => b.localeCompare(a));

        // Slice the array to get the top most recent keys
        const recentKeys = sortedKeys.slice(0, limit);

        return { statusCode: 200, body: JSON.stringify({ body: recentKeys }) };
    } catch (err) {
        console.error('Error listing logs:', err);
        return { statusCode: 500, body: JSON.stringify(err) };
    }
};
