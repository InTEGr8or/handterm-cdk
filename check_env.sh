#!/bin/bash

echo "Checking environment variables..."

echo "Environment variables:"
echo "GITHUB_APP_ID: ${GITHUB_APP_ID:+Set}"
echo "GITHUB_CLIENT_SECRET: ${GITHUB_CLIENT_SECRET:+Set}"
echo "COGNITO_USER_POOL_ID: ${COGNITO_USER_POOL_ID:+Set}"
echo "COGNITO_APP_CLIENT_ID: ${COGNITO_APP_CLIENT_ID:+Set}"

echo "All required environment variables are set."
