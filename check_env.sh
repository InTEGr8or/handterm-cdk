#!/bin/bash

echo "Checking environment variables..."

if [ -f .env ]; then
    echo ".env file found"
    source .env
else
    echo ".env file not found"
fi

echo "Environment variables:"
echo "GITHUB_CLIENT_ID: ${GITHUB_CLIENT_ID:+Set}"
echo "GITHUB_CLIENT_SECRET: ${GITHUB_CLIENT_SECRET:+Set}"
echo "COGNITO_USER_POOL_ID: ${COGNITO_USER_POOL_ID:+Set}"
echo "COGNITO_APP_CLIENT_ID: ${COGNITO_APP_CLIENT_ID:+Set}"

if [ -z "$GITHUB_CLIENT_ID" ] || [ -z "$GITHUB_CLIENT_SECRET" ] || [ -z "$COGNITO_USER_POOL_ID" ] || [ -z "$COGNITO_APP_CLIENT_ID" ]; then
    echo "Error: GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, COGNITO_USER_POOL_ID, and COGNITO_APP_CLIENT_ID must be set in the environment"
    echo "Please ensure you have a .env file in the project root with these variables set"
    echo "Example:"
    echo "GITHUB_CLIENT_ID=your_client_id_here"
    echo "GITHUB_CLIENT_SECRET=your_client_secret_here"
    echo "COGNITO_USER_POOL_ID=your_user_pool_id_here"
    echo "COGNITO_APP_CLIENT_ID=your_app_client_id_here"
    exit 1
fi

echo "All required environment variables are set."
