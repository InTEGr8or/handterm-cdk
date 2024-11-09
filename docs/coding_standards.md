# Coding Standards

* Console log raw objects like this: `console.log('Response:', response.data)` or `console.error('Error:', error)`. DON'T stringify result objects like this: `console.log('Response:', JSON.stringify(response.data, null, 2))` unless it's needed to expand an `[object Object]`.
* This is an AWS CDK project with a Layer shared by many Lambda functions. Don't try to deploy each function independantly because that will cause "drift". Use the NPM scripts from the `package.json` to CDK deploy.
* Use the `lambdaLayer` for dependencies. Don't try to independently "bundle" dependencies in an ad hoc manner.
* All Lambda functions should import Octokit and other addtional non-AWS dependencies they need from the Layer. Do not include these dependencies in individual function packages.
* When looking at test failures, run `bash ./get-logs.sh <failed function name>` to tail the log for the function that failed.