#!/bin/bash

# Instead of set -e, we'll handle errors manually
trap 'echo "Error on line $LINENO"' ERR

function print_usage() {
    echo "Usage: $0 <function-name> [options]"
    echo "Options:"
    echo "  -l, --limit <number>    Number of log entries to show (default: 30)"
    echo "  -t, --tail             Continuously tail the logs"
    echo "  -h, --help             Show this help message"
    echo ""
    echo "Example:"
    echo "  $0 oauth_callback -l 50"
    echo "  $0 oauth_callback --tail"
}

if [ $# -eq 0 ] || [ "$1" == "-h" ] || [ "$1" == "--help" ]; then
    print_usage
    exit 1
fi

FUNCTION_NAME=$1
shift
STREAM_LIMIT=5
LOG_LIMIT=8
TAIL=false

while [[ $# -gt 0 ]]; do
    case $1 in
        -l|--limit)
            STREAM_LIMIT="$2"
            shift 2
            ;;
        -t|--tail)
            TAIL=true
            shift
            ;;
        *)
            echo "Unknown option: $1"
            print_usage
            exit 1
            ;;
    esac
done

# Get AWS region from configuration or default to us-east-1
AWS_REGION=$(aws configure get region || echo "us-east-1")

# Find the log group
LOG_GROUP_NAME=$(aws logs describe-log-groups \
    --query "logGroups[?contains(logGroupName, '/HandTermCdkStack/')].logGroupName" \
    --output json | jq -r ".[] | select(.|test(\"(?i)$FUNCTION_NAME\"))" | head -n 1) || true

if [ -z "$LOG_GROUP_NAME" ]; then
    echo "No log group found for function: $FUNCTION_NAME"
    exit 1
fi

echo "Log group: $LOG_GROUP_NAME"

if [ "$TAIL" = true ]; then
    echo "Tailing logs (Ctrl+C to stop)..."
    aws logs tail "$LOG_GROUP_NAME" --follow --format short --region "$AWS_REGION" || true
else
    # Get the most recent log stream with better error handling
    echo "Checking log streams for group: $LOG_GROUP_NAME for $FUNCTION_NAME in $AWS_REGION"

    # First, let's see what streams are actually available
    echo "Available log streams:"
    aws logs describe-log-streams \
        --log-group-name "$LOG_GROUP_NAME" \
        --order-by LastEventTime \
        --descending \
        --max-items $STREAM_LIMIT \
        --region "$AWS_REGION" \
        --output json | jq -r '.logStreams[].logStreamName'

    # Now get the latest stream
    LATEST_LOG_STREAM=$(aws logs describe-log-streams \
        --log-group-name "$LOG_GROUP_NAME" \
        --order-by LastEventTime \
        --descending \
        --max-items 1 \
        --region "$AWS_REGION" \
        --output json | jq -r '.logStreams[0].logStreamName')

    # Escape the $ in [$LATEST]
    LATEST_LOG_STREAM=${LATEST_LOG_STREAM//\$/\\$}

    echo "Latest log stream    echo "Fetching last $LOj
    echo "Fetching last $LOG_LIMIT log events..."

    # Construct the command string
    CMD="aws logs get-log-events --log-group-name \"$LOG_GROUP_NAME\" --log-stream-name \"$LATEST_LOG_STREAM\" --limit $LOG_LIMIT --region \"$AWS_REGION\" --output json"

    # Echo the command for debugging
    echo "Executing command:"
    echo "$CMD"

    # Execute the command and format the output
    eval "$CMD" | jq -r '.events[].message' | while read -r line; do
        if [[ $line =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z ]]; then
            timestamp=${line:0:24}
            message=${line:24}
            echo -e "\033[32m$timestamp\033[0m$message"
        else
            echo "$line"
        fi
    done
fi
