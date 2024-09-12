const fs = require('fs');

try {
  // Read the outputs.json file
  const outputs = JSON.parse(fs.readFileSync('.aws/outputs.json', 'utf-8'));

  // Find the UserPoolId and ApiEndpoint outputs
  const userPoolId = outputs.HandTermCdkStack.UserPoolId;
  const apiEndpoint = outputs.HandTermCdkStack.ApiEndpoint;

  // Read the current .env file
  let envContent = fs.readFileSync('.env', 'utf-8');

  // Update or add the new values
  envContent = envContent.replace(/^COGNITO_USER_POOL_ID=.*$/m, `COGNITO_USER_POOL_ID=${userPoolId}`);
  envContent = envContent.replace(/^API_ENDPOINT=.*$/m, `API_ENDPOINT=${apiEndpoint}`);

  if (!envContent.includes('COGNITO_USER_POOL_ID=')) {
    envContent += `\nCOGNITO_USER_POOL_ID=${userPoolId}`;
  }
  if (!envContent.includes('API_ENDPOINT=')) {
    envContent += `\nAPI_ENDPOINT=${apiEndpoint}`;
  }

  // Write the updated content back to the .env file
  fs.writeFileSync('.env', envContent);

  console.log('Updated .env file with new UserPoolId and ApiEndpoint');
} catch (error) {
  console.error('Error updating .env file:', error);
}
