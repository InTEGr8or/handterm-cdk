#!/usr/bin/env node
const sourceMapSupport = require('source-map-support');
sourceMapSupport.install();

const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

async function main() {
    const cdk = await import('aws-cdk-lib');
    const { HandTermCdkStack } = await import('../dist/lib/cdk-stack.js').catch(err => {
        console.error('Error importing CDK stack:', err);
        throw err;
    });

    // Load environment variables before anything else
    const envPath = path.resolve(__dirname, '..', '.env');
    console.log(`Attempting to load .env file from: ${envPath}`);

    if (fs.existsSync(envPath)) {
        console.log('.env file found');
        const result = dotenv.config({ path: envPath });
        if (result.error) {
            throw result.error;
        }
        console.log('Environment variables loaded:', {
            GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID ? '[REDACTED]' : 'Not set',
            GITHUB_CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET ? '[REDACTED]' : 'Not set',
            COGNITO_APP_CLIENT_ID: process.env.COGNITO_APP_CLIENT_ID ? '[REDACTED]' : 'Not set'
        });
    } else {
        console.log('.env file not found');
        throw new Error('.env file not found. Please create one in the project root.');
    }
    try {
        console.log('Starting CDK deployment...');

        const app = new cdk.App();
        console.log('CDK App created');

        const requiredEnvVars = ['GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET', 'COGNITO_APP_CLIENT_ID'];
        const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);

        if (missingEnvVars.length > 0) {
            throw new Error(`Missing required environment variables: ${missingEnvVars.join(', ')}`);
        }

        console.log('All required environment variables are set');

        const stackName = 'HandTermCdkStack';

        const stack = new HandTermCdkStack(app, stackName, {
            env: { 
                account: process.env.CDK_DEFAULT_ACCOUNT, 
                region: process.env.CDK_DEFAULT_REGION 
            },
            githubClientId: process.env.GITHUB_CLIENT_ID,
            githubClientSecret: process.env.GITHUB_CLIENT_SECRET,
            cognitoAppClientId: process.env.COGNITO_APP_CLIENT_ID,
        });

        console.log('HandTermCdkStack instantiated');

        const assembly = app.synth();
        console.log('CDK app synthesized');

        return assembly;
    } catch (error) {
        console.error('Error during CDK deployment:');
        if (error instanceof Error) {
            console.error('Error name:', error.name);
            console.error('Error message:', error.message);
            console.error('Stack trace:', error.stack);
        } else {
            console.error('Unknown error:', error);
        }
        throw error;
    }
}

// Set up global error handlers
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise);
    console.error('Reason:', JSON.stringify(reason, null, 2));
    if (reason instanceof Error) {
        console.error('Error name:', reason.name);
        console.error('Error message:', reason.message);
        console.error('Stack trace:', reason.stack);
    }
    process.exit(1);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:');
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    console.error('Stack trace:', error.stack);
    process.exit(1);
});

// Run the main function
main().catch((error) => {
    console.error('Error in main:');
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    console.error('Stack trace:', error.stack);
    process.exit(1);
});
