import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { HandTermCdkStack } from '../lib/cdk-stack.js';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

console.log('Starting CDK deployment...');

// Get the directory of the current module
const currentDir = path.dirname(new URL(import.meta.url).pathname);
const envPath = path.resolve(currentDir, '..', '.env');

console.log(`Attempting to load .env file from: ${envPath}`);

if (fs.existsSync(envPath)) {
  console.log('.env file found');
  dotenv.config({ path: envPath });
} else {
  console.log('.env file not found');
  throw new Error('.env file not found. Please create one in the project root.');
}

console.log('Environment variables loaded');

// Log the values of the environment variables (redacted for security)
console.log('GITHUB_CLIENT_ID:', process.env.GITHUB_CLIENT_ID ? '[REDACTED]' : 'Not set');
console.log('GITHUB_CLIENT_SECRET:', process.env.GITHUB_CLIENT_SECRET ? '[REDACTED]' : 'Not set');
console.log('COGNITO_APP_CLIENT_ID:', process.env.COGNITO_APP_CLIENT_ID ? '[REDACTED]' : 'Not set');

const app = new cdk.App();
console.log('CDK App created');

const requiredEnvVars = ['GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET', 'COGNITO_APP_CLIENT_ID'];
const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingEnvVars.length > 0) {
  console.error(`Error: The following required environment variables are not set: ${missingEnvVars.join(', ')}`);
  console.error('Please ensure you have a .env file in the project root with these variables set');
  console.error('Current environment variables:');
  console.error(JSON.stringify(process.env, null, 2));
  process.exit(1);
}

console.log('All required environment variables are set');

const stackName = 'HandTermCdkStack';

new HandTermCdkStack(app, stackName, {
  env: { 
    account: process.env.CDK_DEFAULT_ACCOUNT, 
    region: process.env.CDK_DEFAULT_REGION 
  },
  githubClientId: process.env.GITHUB_CLIENT_ID!,
  githubClientSecret: process.env.GITHUB_CLIENT_SECRET!,
  cognitoAppClientId: process.env.COGNITO_APP_CLIENT_ID!,
});
console.log('HandTermCdkStack instantiated');

app.synth();
console.log('CDK app synthesized');
