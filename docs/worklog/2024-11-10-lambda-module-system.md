# Lambda Module System Resolution

## Issue
When deploying the CDK stack, Lambda functions were failing with the error:
```
SyntaxError: Unexpected token 'export'
```
This indicated a module system mismatch between our TypeScript/Node.js development environment and the Lambda runtime environment.

## Investigation
1. Initial state:
   - TypeScript files using ES modules (ESM) syntax
   - Lambda runtime using Node.js 18
   - esbuild configured for ESM output
   - Tests passing locally but failing in Lambda

2. Key findings:
   - Node.js 18 in Lambda doesn't support ESM by default
   - Our test environment was using `--experimental-vm-modules` flag
   - Mixed module systems in the codebase (some CommonJS, some ESM)

## Solution Architecture
We implemented a hybrid approach that maintains TypeScript's type safety while ensuring runtime compatibility:

1. Module System:
   - Changed esbuild output to CommonJS (`--format=cjs`)
   - Kept TypeScript type imports separate using `import type`
   - Used `require()` for runtime imports
   - Maintained dynamic imports for third-party modules

2. File Structure:
   ```typescript
   // Type imports (removed at compile time)
   import type { APIGatewayProxyEvent } from 'aws-lambda';

   // Runtime imports
   const { CognitoIdentityProviderClient } = require("@aws-sdk/client-cognito-identity-provider");

   // Export using CommonJS
   exports.handler = async (event) => {
     // Implementation
   };
   ```

3. Build Configuration:
   ```json
   {
     "bundle-lambda": "esbuild dist/lambda/**/*.js --bundle --platform=node --target=node18 --format=cjs --outdir=dist/lambda --allow-overwrite '--external:@aws-sdk/*' '--external:aws-sdk' '--external:@octokit/*' --minify"
   }
   ```

## Implementation Details
1. Updated Lambda source files:
   - Converted ESM exports to CommonJS exports
   - Maintained TypeScript type safety
   - Added debug logging for module loading

2. Build process changes:
   - TypeScript compilation (ESM → CommonJS)
   - esbuild bundling with CommonJS format
   - External dependencies properly handled

3. Testing approach:
   - Verified module loading in CloudWatch logs
   - Tested error handling paths
   - Confirmed proper integration with AWS services

## Results
1. Successful deployment:
   ```
   ✅ HandTermCdkStack
   ✨ Deployment time: 50.85s
   ```

2. Lambda function performance:
   ```
   Duration: 684.34 ms
   Memory Used: 87 MB
   Init Duration: 372.95 ms
   ```

3. Error handling working as expected:
   ```json
   {
     "code": "UserNotFound",
     "message": "User does not exist."
   }
   ```

## Key Decisions
1. **CommonJS Over ESM**: Chose CommonJS for Lambda runtime compatibility without experimental flags.
2. **Type Safety**: Maintained TypeScript types while ensuring runtime compatibility.
3. **Dynamic Imports**: Kept dynamic imports for third-party modules that might need ESM handling.
4. **Debug Logging**: Added comprehensive module loading logs for troubleshooting.

## Future Considerations
1. Consider adding a module system compatibility check to the CI/CD pipeline
2. Document module system requirements in project setup guides
3. Monitor Node.js Lambda runtime updates for native ESM support
4. Consider adding automated tests for module system compatibility

## Related Documentation
- [AWS Lambda Node.js Runtime](https://docs.aws.amazon.com/lambda/latest/dg/lambda-nodejs.html)
- [TypeScript Module Resolution](https://www.typescriptlang.org/docs/handbook/module-resolution.html)
- [esbuild Configuration](https://esbuild.github.io/api/#format)
