export const handler = async (event: any) => {
  const origin = event.headers.origin;
  const allowedOrigins = ['http://localhost:5173', 'https://handterm.com'];

  return {
    statusCode: 200,
    headers: {
      'Access-Control-Allow-Origin': allowedOrigins.includes(origin) ? origin : allowedOrigins[0],
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Credentials': 'true',
    },
    body: JSON.stringify({ message: 'CORS preflight request handled successfully' }),
  };
};
