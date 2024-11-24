#!/bin/bash

# Set your AWS region
AWS_REGION="us-east-1" # Replace with your AWS region if different

# List all users and filter those starting with "testuser_"
test_users=$(aws cognito-idp list-users --user-pool-id $COGNITO_USER_POOL_ID --region $AWS_REGION --query "Users[?starts_with(Username, 'testuser_')].Username" --output text)

# Loop through each test user and delete them
for username in $test_users; do
  echo "Deleting user: $username"
  output=$(aws cognito-idp admin-delete-user --user-pool-id $COGNITO_USER_POOL_ID --username $username --region $AWS_REGION 2>&1)
  exit_code=$?
  if [ $exit_code -eq 0 ]; then
    echo "Successfully deleted user: $username"
  else
    echo "Failed to delete user: $username"
    echo "Error message: $output"
  fi
done

# Check if any users are left
remaining_users=$(aws cognito-idp list-users --user-pool-id $COGNITO_USER_POOL_ID --region $AWS_REGION --query "Users[?starts_with(Username, 'testuser_')].Username" --output text)
if [ -n "$remaining_users" ]; then
  echo "Warning: Some test users could not be deleted. Remaining users:"
  echo "$remaining_users"
else
  echo "All test users have been successfully deleted."
fi

for username in $(aws cognito-idp list-users --user-pool-id us-east-1_zF2pn38Xa --query "Users[].Username" --output text); do
  aws cognito-idp admin-delete-user --user-pool-id us-east-1_zF2pn38Xa --username "$username"
done

echo "Finished deleting test users."
