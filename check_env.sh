#!/bin/bash

echo "Checking environment variables..."

# Required variables
declare -a required_vars=(
    "GITHUB_CLIENT_ID"
    "GITHUB_CLIENT_SECRET"
    "COGNITO_USER_POOL_ID"
)

# Check each required variable
missing_vars=()
for var in "${required_vars[@]}"; do
    if [ -z "${!var}" ]; then
        missing_vars+=("$var")
    else
        echo "$var: Set"
    fi
done

# If any variables are missing, exit with error
if [ ${#missing_vars[@]} -ne 0 ]; then
    echo "Error: The following required environment variables are missing:"
    printf '%s\n' "${missing_vars[@]}"
    return
fi

echo "All required environment variables are set."
return
