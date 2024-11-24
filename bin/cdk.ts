#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { HandTermCdkStack } from '../lib/cdk-stack';

const app = new cdk.App();
const stackName = 'HandTermCdkStack';

// Check required environment variables
const requiredEnvVars = [
  'GITHUB_CLIENT_ID',
  'GITHUB_CLIENT_SECRET'
];

const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingEnvVars.length > 0) {
  console.error('Error: The following environment variables must be set:');
  missingEnvVars.forEach(varName => console.error(`- ${varName}`));
  console.error('Please ensure you have a .env file in the project root with these variables set');
  process.exit(1);
}

new HandTermCdkStack(app, stackName, {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION
  },
  // OAuth credentials for GitHub integration
  githubClientId: process.env.GITHUB_CLIENT_ID!,
  githubClientSecret: process.env.GITHUB_CLIENT_SECRET!,
  cognitoAppClientId: process.env.COGNITO_APP_CLIENT_ID || '',
});

app.synth();
