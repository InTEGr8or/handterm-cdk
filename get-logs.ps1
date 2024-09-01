param (
    [Parameter(Mandatory=$true, Position=0, HelpMessage="The name of the Lambda function", ValueFromPipeline=$true)]
    [string]$FunctionName,
    [Parameter(Mandatory=$false, Position=1)][int]$Limit = 10
)

# Define the base name of your stack
$stackName = "HandTermCdkStack"

# Use AWS CLI to list all Lambda functions and filter by the pattern
$lambdaFunctionName = aws lambda list-functions --output json `
    | ConvertFrom-Json `
    | Select-Object -ExpandProperty Functions `
    | Where-Object { $_.FunctionName -like "*$stackName*$FunctionName*" } `
    | Select-Object -First 1 -ExpandProperty FunctionName

if (-not $lambdaFunctionName) {
    Write-Host "No Lambda function found matching the name $FunctionName"
    exit
}

Write-Host "Matching Lambda function: $lambdaFunctionName"
$logGroupName = "/aws/lambda/$lambdaFunctionName"
Write-Host "Log group: $logGroupName"

# Describe the log streams for the Lambda function and get the most recent one
$latestLogStream = aws logs describe-log-streams `
    --log-group-name "$logGroupName" `
    --order-by LastEventTime `
    --descending `
    --max-items 1 `
    --output json `
    | ConvertFrom-Json `
    | Select-Object -ExpandProperty logStreams `
    | Select-Object -First 1 -ExpandProperty logStreamName

if (-not $latestLogStream) {
    Write-Host "No log streams found for Lambda function $lambdaFunctionName"
    exit
}

Write-Host "Latest log stream: $latestLogStream"

# Retrieve the log events from the latest log stream
$logEvents = aws logs get-log-events `
    --log-group-name "$logGroupName" `
    --log-stream-name "$latestLogStream" `
    --limit $Limit `
    --output json `
    | ConvertFrom-Json `
    | Select-Object -ExpandProperty events `
    | ForEach-Object {
        $_.message `
        -Replace "^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)", "$([char]0x1b)[32m`$1$([char]0x1b)[0m" `
        # -Replace "^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)", "$(Get-Date $1)" 
    }

Write-Host "Last $Limit log events:"
$logEvents | ForEach-Object { Write-Host $_ }

# $logGroupName = "/aws/lambda/HandTermCdkStack-$FunctionName"
# $filterPattern = "[timestamp, requestId, level=INFO, message]"
# $startTime = (Get-Date).AddDays(-1).ToUniversalTime().ticks

# aws logs filter-log-events --log-group-name $logGroupName --filter-pattern $filterPattern --start-time  $startTime --query 'events[*].message' --output text
