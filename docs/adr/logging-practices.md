# Logging Practices for Cross-Process Communication

## Status
Accepted

## Context
During development, we encountered several issues where data being passed between different parts of the system (Lambda functions, authorizers, API Gateway) was not in the expected format or location. The vague error messages made it difficult and time-consuming to diagnose these issues. A specific example was the authorizer context being passed as `{ lambda: { userId: '...' } }` but the code expecting it as `{ userId: '...' }`.

These issues are particularly challenging because:
1. Data structures can be transformed as they cross process boundaries
2. AWS services may wrap or modify data in ways that aren't immediately obvious
3. Error messages that don't show the actual data structure make debugging difficult
4. Cross-process communication issues are hard to catch in local development

## Decision
We will implement comprehensive logging practices that focus on making cross-process data flow visible and understandable:

1. When checking for required data, always log:
   - The full object being checked
   - The specific path/property being looked for
   - The actual value found (or lack thereof)

   Example:
   ```typescript
   const authorizer = event.requestContext?.authorizer;
   console.log('Full authorizer context:', authorizer);
   console.log('Looking for userId at:', 'authorizer.lambda.userId');
   console.log('Value found:', authorizer?.lambda?.userId);
   if (!authorizer?.lambda?.userId) {
       console.error('Required userId not found in path authorizer.lambda.userId. Full authorizer:', authorizer);
       // ... error handling
   }
   ```

2. Error messages must include:
   - What was expected
   - What was actually received
   - The full context object when relevant
   - Clear indication of the process boundary being crossed

3. For Lambda functions:
   - Log the full event object at DEBUG level
   - Log all environment variables at startup (excluding secrets)
   - Log timing information for external calls
   - Use structured logging with consistent fields

4. For API Gateway:
   - Enable detailed execution logging
   - Log request/response pairs
   - Include correlation IDs across boundaries

5. Use log levels appropriately:
   - ERROR: For failures that need immediate attention
   - WARN: For unexpected but handled conditions
   - INFO: For normal operation events
   - DEBUG: For detailed troubleshooting data

6. Standardize error message format:
   ```typescript
   `${operation} failed - Expected ${expected} but received ${actual}. Context: ${JSON.stringify(context)}`
   ```

## Consequences

### Positive
- Faster problem diagnosis
- Better understanding of cross-process data flow
- More maintainable system
- Easier onboarding for new developers
- Better production troubleshooting

### Negative
- Increased log volume
- Slightly more verbose code
- Potential performance impact from additional logging
- Need to be careful about logging sensitive data

### Mitigations
- Use log levels appropriately to control verbosity
- Implement log retention policies
- Create helper functions for common logging patterns
- Add sensitive data filtering

## Implementation Examples

### Lambda Function Error Handling
```typescript
function validateInput(data: any, requiredFields: string[]) {
    console.log('Validating input:', { data, requiredFields });

    const missing = requiredFields.filter(field => !data?.[field]);
    if (missing.length > 0) {
        const error = {
            message: 'Missing required fields',
            expected: requiredFields,
            missing: missing,
            received: data
        };
        console.error('Input validation failed:', error);
        throw new Error(JSON.stringify(error));
    }
}
```

### Cross-Process Data Validation
```typescript
function validateAuthorizerContext(context: any) {
    console.log('Validating authorizer context:', {
        fullContext: context,
        expectedPath: 'lambda.userId',
        actualValue: context?.lambda?.userId
    });

    if (!context?.lambda?.userId) {
        const error = {
            message: 'Invalid authorizer context',
            expected: { lambda: { userId: 'string' } },
            received: context,
            location: 'authorizer validation'
        };
        console.error('Authorizer context validation failed:', error);
        throw new Error(JSON.stringify(error));
    }
}
```

### API Gateway Integration
```typescript
const stage = httpApi.defaultStage?.node.defaultChild as CfnStage;
stage.accessLogSettings = {
    destinationArn: logGroup.logGroupArn,
    format: JSON.stringify({
        requestId: '$context.requestId',
        ip: '$context.identity.sourceIp',
        requestTime: '$context.requestTime',
        httpMethod: '$context.httpMethod',
        routeKey: '$context.routeKey',
        status: '$context.status',
        protocol: '$context.protocol',
        responseLength: '$context.responseLength',
        error: {
            message: '$context.error.message',
            messageString: '$context.error.messageString',
            responseType: '$context.error.responseType'
        },
        authorizer: {
            error: '$context.authorizer.error',
            status: '$context.authorizer.status',
            latency: '$context.authorizer.latency'
        }
    })
};
