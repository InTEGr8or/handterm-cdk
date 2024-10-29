import express from 'express';
import { handler as oauthCallbackHandler } from '../../lambda/authentication/oauth_callback.js';
import { APIGatewayProxyEvent } from '@types/aws-lambda';

const app = express();
const port = 3000;

// Mock OAuth callback endpoint
app.get('/oauth_callback', async (req, res) => {
  // Set test environment variables
  process.env.NODE_ENV = 'test';
  process.env.FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
  process.env.GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID || 'test-client-id';
  process.env.GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET || 'test-client-secret';
  process.env.COGNITO_USER_POOL_ID = process.env.COGNITO_USER_POOL_ID || 'test-pool-id';
  
  const event = {
    queryStringParameters: req.query,
    headers: req.headers,
    requestContext: {
      http: {
        method: 'GET',
        path: '/oauth_callback'
      }
    }
  } as APIGatewayProxyEvent;

  console.log('Handling OAuth callback request:', {
    queryParams: req.query,
    headers: req.headers
  });

  try {
    const result = await oauthCallbackHandler(event);
    console.log('Lambda handler response:', result);
    
    // Set status code from Lambda response
    res.status(result.statusCode);
    
    // Add headers from Lambda response
    if (result.headers) {
      Object.entries(result.headers).forEach(([key, value]) => {
        res.setHeader(key, value);
      });
    }
    
    // Handle both string and object body responses
    if (result.body) {
      if (typeof result.body === 'string') {
        try {
          const parsedBody = JSON.parse(result.body);
          res.json(parsedBody);
        } catch {
          res.send(result.body);
        }
      } else {
        res.json(result.body);
      }
    } else {
      res.end();
    }
  } catch (error) {
    console.error('Error handling request:', error);
    console.error('Error details:', error instanceof Error ? error.stack : String(error));
    
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    const errorResponse = { 
      error: errorMessage,
      errorType: error instanceof Error ? error.constructor.name : typeof error,
      stack: error instanceof Error ? error.stack : undefined
    };
    
    console.error('Sending error response:', errorResponse);
    res.status(500).json(errorResponse);
  }
});

app.listen(port, () => {
  console.log(`Test server running at http://localhost:${port}`);
});
