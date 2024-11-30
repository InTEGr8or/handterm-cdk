# ADR 001: GitHub Account Linking Strategy

## Status
Updated - Switched to Device Flow for CLI-friendly authentication

## Context
HandTerm needs to securely link GitHub accounts to existing Cognito users and provide secure API access to GitHub repositories. The key challenges are:

1. Ensuring secure association between GitHub and Cognito accounts
2. Managing GitHub OAuth tokens
3. Supporting 2FA and modern auth methods (Passkeys)
4. Providing a CLI-friendly authentication experience
5. Maintaining security while improving usability

## Relevant Files

* [The CDK stack](/home/mstouffer/repos/handterm-proj/handterm-cdk/lib/cdk-stack.ts)
* [GitHub utility functions](/home/mstouffer/repos/handterm-proj/handterm-cdk/lambda/authentication/githubUtils.ts)
* [client-side call to the function](/home/mstouffer/repos/handterm-proj/handterm/src/commands/GitHubCommand.ts)
* [Device Auth](/home/mstouffer/repos/handterm-proj/handterm-cdk/lambda/authentication/githubAuthDevice.ts)
* [Device Polling](/home/mstouffer/repos/handterm-proj/handterm-cdk/lambda/authentication/githubDevicePoll.ts)

## Decision
We will implement GitHub integration using GitHub's Device Flow, which is specifically designed for CLI applications:

### Device Flow
Uses GitHub's OAuth Device Flow for account linking:
- Environment Variables:
  - GITHUB_CLIENT_ID: OAuth App client ID
  - GITHUB_CLIENT_SECRET: OAuth App client secret
- OAuth Scopes:
  - `user:email` - Access user email addresses
  - `repo` - Full control of private repositories
  - `read:user` - Read user profile data
- Flow:
  1. User runs `github -l` in HandTerm
  2. HandTerm gets device code from GitHub
  3. HandTerm opens browser to verification URL and copies code to clipboard
  4. User completes auth (with 2FA if enabled)
  5. HandTerm polls for completion
  6. Store GitHub tokens in Cognito attributes

### Implementation Details
1. Device Flow:
   - Uses GitHub's Device Flow API endpoints
   - Automatically opens browser and copies code
   - Handles 2FA/Passkey authentication seamlessly
   - Stores GitHub info in Cognito:
     - custom:gh_id: GitHub user ID
     - custom:gh_username: GitHub username
     - custom:gh_token: GitHub OAuth token

2. API Access:
   - Uses githubUtils.ts for all API operations
   - Uses OAuth token stored in Cognito
   - Provides access to repositories based on OAuth scopes

## Consequences

### Positive
- Better CLI user experience
- Proper support for 2FA and Passkeys
- No need to manually copy/paste URLs
- Can authenticate from any device
- More secure than storing PATs
- Works well with terminal-based workflows

### Negative
- Requires polling for auth completion
- Still needs browser for initial auth
- OAuth tokens need to be managed and stored
- Need to handle token expiration and refresh

## Implementation Notes
1. Environment Variables:
   ```bash
   # OAuth App credentials
   GITHUB_CLIENT_ID=<oauth-app-client-id>
   GITHUB_CLIENT_SECRET=<oauth-app-client-secret>
   ```

2. Key Files:
   - githubAuthDevice.ts: Handles Device Flow authentication
   - githubUtils.ts: Handles all API access using OAuth token

3. User Experience:
   ```bash
   $ github -l
   Opening browser for GitHub authentication...
   Device code copied to clipboard!
   Waiting for authentication...
   Successfully linked GitHub account!
   ```

## Source Documents
- [GitHub Device Flow](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps#device-flow)
- [GitHub OAuth Scopes](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/scopes-for-oauth-apps)
