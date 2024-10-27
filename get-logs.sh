#!/bin/bash

set -e

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
LIMIT=30
TAIL=false

while [[ $# -gt 0 ]]; do
    case $1 in
        -l|--limit)
            LIMIT="$2"
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

STACK_NAME="HandTermCdkStack"

# Find the log group
LOG_GROUP_NAME=$(aws logs describe-log-groups \
    --query "logGroups[?contains(logGroupName, '/HandTermCdkStack/')].logGroupName" \
    --output json | jq -r ".[] | select(.|test(\"(?i)$FUNCTION_NAME\"))" | head -n 1)

if [ -z "$LOG_GROUP_NAME" ]; then
    echo "No log group found for function: $FUNCTION_NAME"
    exit 1
fi

echo "Log group: $LOG_GROUP_NAME"

if [ "$TAIL" = true ]; then
    echo "Tailing logs (Ctrl+C to stop)..."
    aws logs tail "$LOG_GROUP_NAME" --follow --format short
else
    # Get the most recent log stream
    LATEST_LOG_STREAM=$(aws logs describe-log-streams \
        --log-group-name "$LOG_GROUP_NAME" \
        --order-by LastEventTime \
        --descending \
        --max-items 1 \
        --query 'logStreams[0].logStreamName' \
        --output text)

    if [ -z "$LATEST_LOG_STREAM" ] || [ "$LATEST_LOG_STREAM" == "None" ]; then
        echo "No log streams found"
        exit 1
    fi

    echo "Latest log stream: $LATEST_LOG_STREAM"
    echo "Fetching last $LIMIT log events..."

    aws logs get-log-events \
        --log-group-name "$LOG_GROUP_NAME" \
        --log-stream-name "$LATEST_LOG_STREAM" \
        --limit "$LIMIT" \
        --output json | jq -r '.events[].message' | while read -r line; do
            if [[ $line =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z ]]; then
                timestamp=${line:0:24}
                message=${line:24}
                echo -e "\033[32m$timestamp\033[0m$message"
            else
                echo "$line"
            fi
        done
fi
