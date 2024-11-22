# ADR 001: GitHub Account Linking Strategy

## Status
Accepted

## Context
HandTerm needs to securely link GitHub accounts to existing Cognito users to enable GitHub integration features. The key challenges are:

1. Ensuring secure association between GitHub and Cognito accounts
2. Managing multiple types of tokens (Cognito and GitHub)
3. Maintaining user context through the OAuth flow
4. Preventing unauthorized account linking

## Decision
We will implement GitHub account linking using the following approach:

1. Pass Cognito token in OAuth state parameter:
   - Include the user's Cognito access token in the state parameter during GitHub OAuth initiation
   - Encode state parameter using base64 to safely transmit tokens
   - Include timestamp in state to prevent replay attacks

2. Store GitHub credentials in Cognito user attributes:
   - Store GitHub user ID as custom:gh_id
   - Store GitHub username as custom:gh_username
   - Store GitHub access token as custom:gh_token

3. Use AdminUpdateUserAttributesCommand instead of creating new users:
   - Modify oauth_callback to update existing Cognito users
   - Validate Cognito token from state before linking
   - Update user attributes with GitHub information

## Consequences

### Positive
- Secure 1:1 mapping between Cognito and GitHub accounts
- No need for separate token storage infrastructure
- Clear ownership of GitHub tokens
- Simplified token refresh process
- Frontend only needs to manage Cognito tokens

### Negative
- Increased state parameter size
- Need to handle token expiration for both auth systems
- Additional API call to validate Cognito token during OAuth callback

## Implementation Notes
1. Frontend changes:
   - GitHubCommand.ts includes Cognito token in state
   - State parameter includes timestamp and action type

2. Backend changes:
   - oauth_callback.ts validates Cognito token
   - Uses AdminUpdateUserAttributesCommand for linking
   - Stores GitHub tokens in Cognito attributes

3. Documentation:
   - Updated grant_flow.md with new sequence diagram
   - Added security considerations
   - Documented token management strategy
