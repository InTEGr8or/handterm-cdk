param (
    [string]$FunctionNamePattern
)

# Define the base name of your stack
$stackName = "HandTermCdkStack"

# Use AWS CLI to list all Lambda functions and filter by the pattern
$lambdaFunctionName = aws lambda list-functions `
    | jq -r --arg pattern "$stackName.$FunctionNamePattern" '.Functions[] | select(.FunctionName | contains($pattern)) | .FunctionName' `
    | Select-Object -First 1

if (-not $lambdaFunctionName) {
    Write-Host "No Lambda function found matching the pattern $FunctionNamePattern"
    exit
}

# Describe the log streams for the Lambda function and get the most recent one
$latestLogStream = aws logs describe-log-streams `
    --log-group-name "/aws/lambda/$lambdaFunctionName" `
    --order-by "LastEventTime" `
    --descending `
    --limit 1 `
    | jq -r '.logStreams[0].logStreamName'

if (-not $latestLogStream) {
    Write-Host "No log streams found for Lambda function $lambdaFunctionName"
    exit
}

Write-Host "Latest log stream for $lambdaFunctionName: $latestLogStream"

# Retrieve the log events from the latest log stream
$logEvents = aws logs get-log-events `
    --log-group-name "/aws/lambda/$lambdaFunctionName" `
    --log-stream-name "$latestLogStream" `
    --limit 10 `
    | jq -r '.events[].message'

Write-Host "Log events:"
Write-Host $logEvents