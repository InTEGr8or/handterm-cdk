#!/usr/bin/env node

const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

// Disable debugger attachment and inspector
process.env.NODE_OPTIONS = '';
process.execArgv = process.execArgv.filter(arg => !arg.includes('--inspect'));

async function main() {
    const cdk = await import('aws-cdk-lib');
    let HandTermCdkStack;
    try {
        const module = await import('../dist/lib/cdk-stack.js');
        HandTermCdkStack = module.HandTermCdkStack;
    } catch (err) {
        console.error('Error importing CDK stack:', err);
        throw err;
    }

    // Load environment variables before anything else
    const envPath = path.resolve(__dirname, '..', '.env');
    console.log(`Attempting to load .env file from: ${envPath}`);

    if (fs.existsSync(envPath)) {
        console.log('.env file found');
        const result = dotenv.config({ path: envPath });
        if (result.error) {
            throw result.error;
        }
        console.log('Environment check in cdk.cjs:');
        console.log('GITHUB_CLIENT_ID:', process.env.GITHUB_CLIENT_ID ? '[SET]' : '[NOT SET]');
        console.log('GITHUB_CLIENT_SECRET:', process.env.GITHUB_CLIENT_SECRET ? '[SET]' : '[NOT SET]');
        console.log('COGNITO_APP_CLIENT_ID:', process.env.COGNITO_APP_CLIENT_ID ? '[SET]' : '[NOT SET]');
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

        const assembly = app.synth({
            outdir: './cdk.out'
        });
        console.log('CDK app synthesized');
        console.log('CDK app synthesized to:', assembly.directory);
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

// Run the main function with enhanced error logging
main().then((assembly) => {
    console.log('CDK deployment completed successfully');
}).catch((error) => {
    console.error('CDK Deployment Error:');
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    console.error('Stack trace:', error.stack);
    
    // Log additional context if available
    if (error.context) {
        console.error('Error context:', error.context);
    }
    
    // Log AWS specific error details if present
    if (error.requestId || error.code || error.region) {
        console.error('AWS Error Details:', {
            requestId: error.requestId,
            code: error.code,
            region: error.region
        });
    }
    
    process.exit(1);
});
