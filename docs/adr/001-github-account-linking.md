# ADR 001: GitHub Account Linking Strategy

## Status
Updated - Simplified to OAuth-only approach

## Context
HandTerm needs to securely link GitHub accounts to existing Cognito users and provide secure API access to GitHub repositories. The key challenges are:

1. Ensuring secure association between GitHub and Cognito accounts
2. Managing GitHub OAuth tokens
3. Maintaining user context through the OAuth flow
4. Providing secure API access to repositories

## Decision
We will implement GitHub integration using OAuth only, with appropriate scopes for repository access:

### OAuth Flow
Uses GitHub OAuth App for both account linking and API access:
- Environment Variables:
  - GITHUB_CLIENT_ID: OAuth App client ID
  - GITHUB_CLIENT_SECRET: OAuth App client secret
- OAuth Scopes:
  - `openid` - OpenID Connect authentication
  - `user:email` - Access user email addresses
  - `repo` - Full control of private repositories
  - `read:user` - Read user profile data
- Flow:
  1. User initiates GitHub sign-in
  2. OAuth redirect to GitHub with client_id and scopes
  3. GitHub redirects back with code
  4. Backend exchanges code for access token
  5. Store GitHub user ID, username, and access token in Cognito attributes

### Implementation Details
1. OAuth Flow:
   - Uses oauth_callback.ts for handling GitHub OAuth
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
- Simpler implementation with single authentication method
- Direct repository access through OAuth token
- No need for additional installation steps
- Standard OAuth flow that users are familiar with
- Follows GitHub's recommended practices for web applications

### Negative
- OAuth tokens need to be managed and stored
- Need to handle token expiration and refresh
- Broader repository access scope than might be needed

## Implementation Notes
1. Environment Variables:
   ```bash
   # OAuth App credentials
   GITHUB_CLIENT_ID=<oauth-app-client-id>
   GITHUB_CLIENT_SECRET=<oauth-app-client-secret>
   ```

2. Key Files:
   - oauth_callback.ts: Handles OAuth flow and token management
   - githubUtils.ts: Handles all API access using OAuth token

3. Documentation:
   - Updated grant_flow.md with OAuth flow diagram
   - Added security considerations
   - Documented token management strategy

## Source Documents
- [GitHub OAuth Apps](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps)
- [GitHub OAuth Scopes](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/scopes-for-oauth-apps)
