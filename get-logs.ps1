param (
    [Parameter(Mandatory=$true)]
    [string]$FunctionName
)

# Define the base name of your stack
$stackName = "HandTermCdkStack"

# Use AWS CLI to list all Lambda functions and filter by the pattern
$lambdaFunctionName = aws lambda list-functions `
    | ConvertFrom-Json `
    | Select-Object -ExpandProperty Functions `
    | Where-Object { $_.FunctionName -like "*$stackName*$FunctionName*" } `
    | Select-Object -First 1 -ExpandProperty FunctionName

if (-not $lambdaFunctionName) {
    Write-Host "No Lambda function found matching the name $FunctionName"
    exit
}

Write-Host "Matching Lambda function: $lambdaFunctionName"

# Describe the log streams for the Lambda function and get the most recent one
$latestLogStream = aws logs describe-log-streams `
    --log-group-name "/aws/lambda/$lambdaFunctionName" `
    --order-by LastEventTime `
    --descending `
    --max-items 1 `
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
    --log-group-name "/aws/lambda/$lambdaFunctionName" `
    --log-stream-name "$latestLogStream" `
    --limit 10 `
    | ConvertFrom-Json `
    | Select-Object -ExpandProperty events `
    | ForEach-Object { $_.message }

Write-Host "Last 10 log events:"
$logEvents | ForEach-Object { Write-Host $_ }
