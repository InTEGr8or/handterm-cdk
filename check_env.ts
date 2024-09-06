import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

// Get the directory of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, '.env');

console.log(`Current directory: ${__dirname}`);
console.log(`Attempting to load .env file from: ${envPath}`);

if (fs.existsSync(envPath)) {
  console.log('.env file found');
  dotenv.config({ path: envPath });
} else {
  console.log('.env file not found');
}

console.log('Environment variables:');
console.log('GITHUB_CLIENT_ID:', process.env.GITHUB_CLIENT_ID ? 'Set' : 'Not set');
console.log('GITHUB_CLIENT_SECRET:', process.env.GITHUB_CLIENT_SECRET ? 'Set' : 'Not set');
console.log('COGNITO_USER_POOL_ID:', process.env.COGNITO_USER_POOL_ID ? 'Set' : 'Not set');
console.log('COGNITO_APP_CLIENT_ID:', process.env.COGNITO_APP_CLIENT_ID ? 'Set' : 'Not set');

if (!process.env.GITHUB_CLIENT_ID || !process.env.GITHUB_CLIENT_SECRET) {
  console.error('Error: GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET must be set in the environment');
  console.error('Please ensure you have a .env file in the project root with these variables set');
  console.error('Example:');
  console.error('GITHUB_CLIENT_ID=your_client_id_here');
  console.error('GITHUB_CLIENT_SECRET=your_client_secret_here');
  process.exit(1);
}

console.log('All required environment variables are set.');
