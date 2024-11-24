# GitHub Authentication Simplification

## Context
We had a complex setup using both GitHub OAuth App (for account linking) and GitHub App (for API access). This led to confusion and issues with token management.

## Changes Made

### 1. Simplified to OAuth-Only Approach
- Removed GitHub App integration
- Updated OAuth scopes to include repository access:
  - `repo` - Full control of private repositories
  - `read:user` - Read user profile data
  - `user:email` - Access user email addresses

### 2. Token Management
- Modified oauth_callback.ts to store OAuth token in Cognito
- Removed GitHub App installation token logic
- Updated githubUtils.ts to use OAuth token directly for API access

### 3. Environment Variables
- Simplified environment variables:
  ```bash
  GITHUB_CLIENT_ID=<oauth-app-client-id>
  GITHUB_CLIENT_SECRET=<oauth-app-client-secret>
  ```
- Removed GitHub App related variables:
  - GITHUB_APP_ID
  - GITHUB_APP_PRIVATE_KEY

### 4. Documentation
- Updated ADR to reflect OAuth-only approach
- Clarified token management strategy
- Added source documentation links

## Testing
- All tests passing:
  - listRecentRepos.test.ts: 5 tests passing
  - getRepoTree.test.ts: 5 tests passing
- Verified OAuth flow with new scopes
- Confirmed repository access working

## Benefits
1. Simpler authentication flow
2. No need for separate GitHub App installation
3. Direct repository access through OAuth token
4. Clearer token management strategy

## Next Steps
1. Monitor token expiration and refresh flow
2. Consider implementing token refresh mechanism
3. Add more comprehensive error handling for OAuth-specific errors
