#!/bin/bash

 set -e

 LIMIT=${1:-30}
 STACK_PREFIX="/HandTermCdkStack/"

 # Get all log groups with the prefix
 LOG_GROUPS=$(aws logs describe-log-groups \
     --log-group-name-prefix "$STACK_PREFIX" \
     --query 'logGroups[*].logGroupName' \
     --output json | jq -r '.[]')

 for LOG_GROUP in $LOG_GROUPS; do
     echo "Processing log group: $LOG_GROUP"

     # Get the latest log stream for this log group
     LATEST_LOG_STREAM=$(aws logs describe-log-streams \
         --log-group-name "$LOG_GROUP" \
         --order-by LastEventTime \
         --descending \
         --max-items 1 \
         --query 'logStreams[0].logStreamName' \
         --output text)

     if [ "$LATEST_LOG_STREAM" == "None" ] || [ -z "$LATEST_LOG_STREAM" ]; then        
         echo "No log streams found for log group $LOG_GROUP"
         continue
     fi

     echo "Latest log stream: $LATEST_LOG_STREAM"

     # Get the log events
     aws logs get-log-events \
         --log-group-name "$LOG_GROUP" \
         --log-stream-name "$LATEST_LOG_STREAM" \
         --limit $LIMIT \
         --output json | \
         jq -r '.events[].message' | \
         while read -r line; do
             timestamp=$(echo "$line" | grep -oP
 '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z' || true)
             message=$(echo "$line" | sed
 's/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z//')
             if [ -n "$timestamp" ]; then
                 echo -e "\e[32m$timestamp\e[0m $LOG_GROUP: $message"
             else
                 echo "$LOG_GROUP: $line"
             fi
         done

     echo "----------------------------------------"
 done

 echo "Displayed up to $LIMIT latest log events for each log group."