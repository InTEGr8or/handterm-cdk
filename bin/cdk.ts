import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { HandTermCdkStack } from '../lib/cdk-stack.js';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

process.stdout.write('Starting CDK deployment...\n');

// Get the directory of the current module
const currentDir = path.dirname(new URL(import.meta.url).pathname);
const envPath = path.resolve(currentDir, '..', '.env');

process.stdout.write(`Attempting to load .env file from: ${envPath}\n`);

if (fs.existsSync(envPath)) {
  process.stdout.write('.env file found\n');
  dotenv.config({ path: envPath });
} else {
  process.stdout.write('.env file not found\n');
}

process.stdout.write('Dotenv config loaded\n');

const app = new cdk.App();
process.stdout.write('CDK App created\n');

const githubClientId = process.env.GITHUB_CLIENT_ID;
const githubClientSecret = process.env.GITHUB_CLIENT_SECRET;

process.stdout.write(`GITHUB_CLIENT_ID: ${githubClientId ? 'Set' : 'Not set'}\n`);
process.stdout.write(`GITHUB_CLIENT_SECRET: ${githubClientSecret ? 'Set' : 'Not set'}\n`);

if (!githubClientId || !githubClientSecret) {
  throw new Error('GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET must be set in the .env file');
}

new HandTermCdkStack(app, 'HandTermCdkStack', {
  githubClientId,
  githubClientSecret,
});
process.stdout.write('HandTermCdkStack instantiated\n');

app.synth();
process.stdout.write('CDK app synthesized\n');
