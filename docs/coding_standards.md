# Coding Standards

## Project Structure
* This is an AWS CDK project with a Layer shared by many Lambda functions. Don't try to deploy each function independently because that will cause "drift". Use the NPM scripts from the `package.json` to CDK deploy.
* Use the `lambdaLayer` for dependencies. Don't try to independently "bundle" dependencies in an ad hoc manner.
* All Lambda functions should import Octokit and other additional non-AWS dependencies they need from the Layer. Do not include these dependencies in individual function packages.

## Logging Standards
* Console log raw objects like this: `console.log('Response:', response.data)` or `console.error('Error:', error)`. DON'T stringify result objects like this: `console.log('Response:', JSON.stringify(response.data, null, 2))` unless it's needed to expand an `[object Object]`.
* When looking at test failures, run `bash ./get-logs.sh <failed function name>` to tail the log for the function that failed.

### Cross-Process Data Validation
* When validating data across process boundaries (e.g., Lambda authorizers, API Gateway), always log:
  - The full object being validated
  - The expected data structure/path
  - The actual value found (or missing)
  ```typescript
  // Example:
  console.log('Validating context:', {
    fullObject: context,
    expectedPath: 'path.to.property',
    actualValue: context?.path?.to?.property
  });
  ```

### Error Messages
* Error messages must include:
  - Expected value/format
  - Actual value/format received
  - Full context when relevant
  ```typescript
  // Example:
  console.error('Validation failed:', {
    message: 'Invalid input',
    expected: { format: 'expected' },
    received: actualValue,
    context: fullContext
  });
  ```

### Lambda Functions
* Log the full event object at function entry
* Log all non-sensitive environment variables at startup
* Log timing information for external service calls
* Use appropriate log levels:
  - ERROR: Failures needing immediate attention
  - WARN: Unexpected but handled conditions
  - INFO: Normal operation events
  - DEBUG: Detailed troubleshooting data

For detailed logging requirements and examples, see [Logging Practices ADR](./adr/logging-practices.md).
