export const handler = async (event: any) => {
  return {
    statusCode: 200,
    headers: {
      'Access-Control-Allow-Origin': 'http://localhost:5173',
      'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
      'Access-Control-Allow-Methods': 'GET,OPTIONS,POST,PUT,DELETE',
      'Access-Control-Allow-Credentials': true,
    },
    body: JSON.stringify({ message: 'CORS preflight request handled successfully' }),
  };
};
