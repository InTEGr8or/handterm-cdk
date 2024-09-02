param(
    [string]$Filter = "*"
)

# Escape single quotes in the filter
$escapedFilter = $Filter.Replace("'", "''")

# Get and filter log groups using AWS CLI query
$logGroups = aws logs describe-log-groups --query "logGroups[?contains(logGroupName, '$escapedFilter')].logGroupName" --output json | ConvertFrom-Json

# Output the filtered log groups
$logGroups | Format-Table -AutoSize

Write-Host "Total log groups: $($logGroups.Count)"
