#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { HandTermCdkStack } from '../lib/cdk-stack';

const app = new cdk.App();
const stackName = 'HandTermCdkStack';

console.log("GITHUB_CLIENT_ID:", process.env.GITHUB_CLIENT_ID);

if (!process.env.GITHUB_CLIENT_ID || !process.env.GITHUB_CLIENT_SECRET) {
  console.error('Error: GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET must be set in the environment');
  console.error('Please ensure you have a .env file in the project root with these variables set');
  process.exit(1);
}

new HandTermCdkStack(app, stackName, {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION
  },
  githubClientId: process.env.GITHUB_CLIENT_ID,
  githubClientSecret: process.env.GITHUB_CLIENT_SECRET,
  cognitoAppClientId: process.env.COGNITO_APP_CLIENT_ID || '',
});

app.synth();
