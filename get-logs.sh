#!/bin/bash

set -e

if [ $# -eq 0 ]; then
    echo "Please provide the name of the Lambda function as an argument."
    exit 1
fi

FUNCTION_NAME=$1
LIMIT=${2:-30}

STACK_NAME="HandTermCdkStack"

LOG_GROUP_NAME=$(aws logs describe-log-groups --query "logGroups[?contains(logGroupName, 'HandTerm')].logGroupName" --output json | jq -r ".[] | select(.|test(\"(?i)$FUNCTION_NAME\"))" | head -n 1)

if [ -z "$LOG_GROUP_NAME" ]; then
    echo "No log group found for function: $FUNCTION_NAME"
    exit 1
fi

echo "Log group: $LOG_GROUP_NAME"

LATEST_LOG_STREAMS=$(aws logs describe-log-streams \
    --log-group-name "$LOG_GROUP_NAME" \
    --order-by LastEventTime \
    --descending \
    --max-items 5 \
    --query 'logStreams[*].logStreamName' \
    --output json)

if [ "$LATEST_LOG_STREAMS" == "[]" ] || [ -z "$LATEST_LOG_STREAMS" ]; then
    echo "No log streams found for Lambda function $FUNCTION_NAME"
    exit 1
fi

echo "Latest log streams: $LATEST_LOG_STREAMS"

echo "Fetching last $LIMIT log events..."
LOG_EVENTS=""
for STREAM in $(echo "$LATEST_LOG_STREAMS" | jq -r '.[]'); do
    EVENTS=$(aws logs get-log-events \
        --log-group-name "$LOG_GROUP_NAME" \
        --log-stream-name "$STREAM" \
        --limit $LIMIT \
        --start-from-head \
        --output json)
    
    if [ -n "$EVENTS" ] && [ "$(echo "$EVENTS" | jq '.events | length')" -gt 0 ]; then
        LOG_EVENTS="$EVENTS"
        break
    fi
done

if [ -z "$LOG_EVENTS" ] || [ "$(echo "$LOG_EVENTS" | jq '.events | length')" -eq 0 ]; then
    echo "No log events found in any of the recent streams. The function might not have been invoked recently."
else
    echo "Last $LIMIT log events:"
    echo "$LOG_EVENTS" | jq -r '.events[].message' | while read -r line; do
        if [[ $line =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z ]]; then
            timestamp=${line:0:24}
            message=${line:24}
            echo -e "\033[32m$timestamp\033[0m$message"
        else
            echo "$line"
        fi
    done
fi
