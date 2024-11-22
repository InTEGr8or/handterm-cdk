import express from 'express';
import { handler as oauthCallbackHandler } from '../../lambda/authentication/oauth_callback.js';
import { APIGatewayProxyEvent } from '@types/aws-lambda';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const app = express();
const port = 3000;

// Middleware to log all requests
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Set up JSON parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Comprehensive environment variable setup
const requiredEnvVars = [
  'NODE_ENV', 'FRONTEND_URL', 'GITHUB_APP_ID',
  'GITHUB_APP_PRIVATE_KEY', 'COGNITO_USER_POOL_ID'
];

requiredEnvVars.forEach(varName => {
  process.env[varName] = process.env[varName] ||
    (varName === 'NODE_ENV' ? 'development' :
      varName === 'FRONTEND_URL' ? 'http://localhost:5173' :
        `test-${varName.toLowerCase()}`);
});

console.log('Local server environment:', {
  NODE_ENV: process.env.NODE_ENV,
  FRONTEND_URL: process.env.FRONTEND_URL,
  GITHUB_APP_ID: process.env.GITHUB_APP_ID ? 'Set' : 'Not set',
  GITHUB_APP_PRIVATE_KEY: process.env.GITHUB_APP_PRIVATE_KEY ? 'Set' : 'Not set',
  COGNITO_USER_POOL_ID: process.env.COGNITO_USER_POOL_ID
});

// Mock OAuth callback endpoint
app.get('/oauth_callback', async (req, res) => {
  const event = {
    queryStringParameters: req.query,
    headers: req.headers,
    requestContext: {
      http: {
        method: 'GET',
        path: '/oauth_callback'
      }
    }
  } as unknown as APIGatewayProxyEvent;

  try {
    const result = await oauthCallbackHandler(event);

    // Comprehensive response handling
    res.status(result.statusCode);

    if (result.headers) {
      Object.entries(result.headers).forEach(([key, value]) => {
        res.setHeader(key, String(value));
      });
    }

    if (result.body) {
      try {
        const parsedBody = typeof result.body === 'string'
          ? JSON.parse(result.body)
          : result.body;
        res.json(parsedBody);
      } catch {
        res.send(result.body);
      }
    } else {
      res.end();
    }
  } catch (error) {
    console.error('OAuth Callback Error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});


// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled Error:', err);
  res.status(500).json({
    error: 'Unexpected Server Error',
    details: err.message
  });
});

const server = app.listen(port, () => {
  console.log(`Test server running at http://localhost:${port}`);
  console.log('Available endpoints:');
  console.log('- GET /oauth_callback');
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down server...');
  server.close(() => {
    console.log('Server stopped.');
    process.exit(0);
  });
});
