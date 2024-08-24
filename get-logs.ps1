aws logs describe-log-groups `
| jq '.logGroups[] | select(.logGroupName | contains("oauth_callback")) | .logGroupName'
