#!/usr/bin/env node
const { register } = require('ts-node');

register({
  compilerOptions: {
    module: 'CommonJS',
    moduleResolution: 'node',
    target: 'ES2022',
    esModuleInterop: true,
    allowJs: true,
    strict: true
  }
});

const path = require('path');
const { App } = require('aws-cdk-lib');
const { HandTermCdkStack } = require('../lib/cdk-stack');

async function main() {
  try {
    console.log('Starting CDK deployment...');

    const app = new App();
    console.log('CDK App created');

    const stackName = 'HandTermCdkStack';
    console.log("GITHUB_CLIENT_ID:", process.env.GITHUB_CLIENT_ID);

    if (!process.env.GITHUB_CLIENT_ID || !process.env.GITHUB_CLIENT_SECRET) {
      console.error('Error: GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET must be set in the environment');
      console.error('Please ensure you have a .env file in the project root with these variables set');
      process.exit(1);
    }

    const stack = new HandTermCdkStack(app, stackName, {
      env: {
        account: process.env.CDK_DEFAULT_ACCOUNT,
        region: process.env.CDK_DEFAULT_REGION
      },
      githubClientId: process.env.GITHUB_CLIENT_ID,
      githubClientSecret: process.env.GITHUB_CLIENT_SECRET,
      cognitoAppClientId: process.env.COGNITO_APP_CLIENT_ID || '',
    });

    console.log('HandTermCdkStack instantiated');

    const assembly = app.synth();
    console.log('CDK app synthesized to:', assembly.directory);
    return assembly;
  } catch (error) {
    console.error('Error during CDK deployment:', error);
    throw error;
  }
}

// Run the main function
main().catch((error) => {
  console.error('CDK Deployment Error:', error);
  process.exit(1);
});
