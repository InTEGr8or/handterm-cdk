## GitHub OAuth Flow

This document describes the OAuth flow for linking GitHub accounts to existing Cognito users in HandTerm.

```mermaid
sequenceDiagram
    participant User
    participant H as HandTerm
    participant A as API Gateway
    participant GitHub
    participant Cognito

    User->>H: Initiates GitHub Auth
    H ->>H: Get Cognito Token
    H ->>A: Request GitHub Auth URL with Token in State
    A->>H: Return GitHub Auth URL
    H ->>GitHub: Redirect to GitHub Auth
    User->>GitHub: Authorize App
    GitHub->>A: Redirect with Auth Code
    A->>GitHub: Exchange Code for Tokens

    Note over A,GitHub: LOG: All returned data
    Note over A,GitHub: RECEIVE: access_token, refresh_token,<br/>expires_in,refresh_token_expires_in
    GitHub->>A: Return Access & Refresh Tokens

    A->>A: Extract Cognito Token from State
    A->>Cognito: Get User Info from Token
    Cognito->>A: Return User Info

    Note over A,Cognito: UPDATE: Link GitHub to Cognito User<br/>custom:gh_id, custom:gh_username,<br/>custom:gh_token
    A->>Cognito: Update User Attributes
    Cognito->>A: Confirm Update
    A->>H: Auth Success
    H ->>User: Display Success

    Note over H,A: Subsequent API Calls
    H ->>A: Request GitHub Data
    A->>Cognito: Retrieve GitHub Token
    Cognito->>A: Return Token
    A->>GitHub: API Request with Token
    GitHub->>A: Return Data
    A->>H: Return Data
    H ->>User: Display Data

    Note over A,GitHub: Token Refresh Flow
    A->>GitHub: Refresh Token Request
    GitHub->>A: New Access & Refresh Tokens
    A->>Cognito: Update Tokens
    Cognito->>A: Confirm Update
```

### Flow Description

1. User initiates GitHub authorization through the frontend
2. HandTerm includes the current user's Cognito token in the state parameter
3. User authorizes the application on GitHub
4. GitHub redirects back to our OAuth callback endpoint with an auth code
5. API Gateway exchanges the code for GitHub tokens
6. API Gateway extracts the Cognito token from state and gets user info
7. API Gateway updates the Cognito user's attributes with GitHub information:
   - custom:gh_id: GitHub user ID
   - custom:gh_username: GitHub username
   - custom:gh_token: GitHub access token

### Security Considerations

- The state parameter includes a timestamp to prevent replay attacks
- The Cognito token in state allows secure linking to the correct user
- All tokens are stored in Cognito user attributes
- HandTerm stores only the Cognito tokens, not GitHub tokens

### Token Management

- GitHub tokens are stored in Cognito user attributes
- Tokens are refreshed automatically when expired
- Token updates are synchronized between GitHub and Cognito
