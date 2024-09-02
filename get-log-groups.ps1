param(
    [string]$Filter = "*"
)

# Get all log groups
$logGroups = aws logs describe-log-groups --query 'logGroups[*].logGroupName' --output json | ConvertFrom-Json

# Filter log groups based on the provided filter
$filteredLogGroups = $logGroups | Where-Object { $_ -like $Filter }

# Output the filtered log groups
$filteredLogGroups | Format-Table -AutoSize

Write-Host "Total log groups: $($filteredLogGroups.Count)"
