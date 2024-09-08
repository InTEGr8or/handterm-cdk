#!/bin/bash

 set -e

 if [ $# -eq 0 ]; then
     echo "Please provide the name of the Lambda function as an argument."
     exit 1
 fi

 FUNCTION_NAME=$1
 LIMIT=${2:-30}

 STACK_NAME="HandTermCdkStack"

 LOG_GROUP_NAME=$(aws logs describe-log-groups --query "logGroups[?contains(logGroupName,
 'HandTerm')].logGroupName" --output json | jq -r ".[] | select(.|test(\"(?i)$FUNCTION_NAME\"))" | head -n)

 if [ -z "$LOG_GROUP_NAME" ]; then
     echo "No log group found for function: $FUNCTION_NAME"
     exit 1
 fi

 echo "Log group: $LOG_GROUP_NAME"

 LATEST_LOG_STREAM=$(aws logs describe-log-streams \
     --log-group-name "$LOG_GROUP_NAME" \
     --order-by LastEventTime \
     --descending \
     --max-items 1 \
     --query 'logStreams[0].logStreamName' \
     --output text)

 if [ "$LATEST_LOG_STREAM" == "None" ] || [ -z "$LATEST_LOG_STREAM" ]; then
     echo "No log streams found for Lambda function $FUNCTION_NAME"
     exit 1
 fi

 echo "Latest log stream: $LATEST_LOG_STREAM"

 aws logs get-log-events \
     --log-group-name "$LOG_GROUP_NAME" \
     --log-stream-name "$LATEST_LOG_STREAM" \
     --limit $LIMIT \
     --output json | jq -r '.events[].message' | while read -r line; do
         timestamp=$(echo "$line" | grep -oP '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z' || true)       
         message=$(echo "$line" | sed 's/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z//')
         if [ -n "$timestamp" ]; then
             echo -e "\e[32m$timestamp\e[0m$message"
         else
             echo "$line"
         fi
     done

 echo "Last $LIMIT log events displayed."