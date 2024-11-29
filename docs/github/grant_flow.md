## GitHub Device Flow Authentication

This document describes the Device Flow for linking GitHub accounts to existing Cognito users in HandTerm.

```mermaid
sequenceDiagram
    participant User
    participant H as HandTerm
    participant A as API Gateway
    participant GitHub
    participant Cognito
    participant Browser

    User->>H: github -l
    H->>A: Request Device Code
    A->>GitHub: POST /login/device/code
    GitHub->>A: Return Device & User Codes
    A->>H: Return Codes & Verification URI

    Note over H: Copy code to clipboard
    H->>Browser: Open verification URI
    Note over Browser: Paste code from clipboard

    User->>GitHub: Complete Auth (with 2FA if enabled)

    loop Poll for completion
        H->>A: Check Auth Status
        A->>GitHub: POST /login/oauth/access_token
        GitHub->>A: Return Status/Tokens
        A->>H: Return Status
    end

    Note over A,GitHub: Received Tokens
    Note over A,GitHub: LOG: access_token, expires_in

    A->>Cognito: Get User Info from Token
    Cognito->>A: Return User Info

    Note over A,Cognito: UPDATE: Link GitHub to Cognito User<br/>custom:gh_id, custom:gh_username,<br/>custom:gh_token
    A->>Cognito: Update User Attributes
    Cognito->>A: Confirm Update
    A->>H: Auth Success
    H->>User: Display Success

    Note over H,A: Subsequent API Calls
    H->>A: Request GitHub Data
    A->>Cognito: Retrieve GitHub Token
    Cognito->>A: Return Token
    A->>GitHub: API Request with Token
    GitHub->>A: Return Data
    A->>H: Return Data
    H->>User: Display Data

    Note over A,GitHub: Token Refresh Flow
    A->>GitHub: Refresh Token Request
    GitHub->>A: New Access Token
    A->>Cognito: Update Token
    Cognito->>A: Confirm Update
```

### Flow Description

1. User initiates GitHub authorization with `github -l`
2. HandTerm requests a device code from GitHub
3. GitHub returns:
   - device_code: Used for polling
   - user_code: Code for user to enter
   - verification_uri: URL for authentication
4. HandTerm:
   - Opens browser to verification_uri
   - Copies user_code to clipboard
   - Begins polling for completion
5. User completes authentication in browser:
   - Pastes code (already in clipboard)
   - Completes 2FA/Passkey if enabled
6. Upon success:
   - GitHub provides access token
   - API Gateway updates Cognito user attributes:
     - custom:gh_id: GitHub user ID
     - custom:gh_username: GitHub username
     - custom:gh_token: GitHub access token

### Security Considerations

- Device Flow is designed for CLI applications
- Supports 2FA and modern authentication methods
- No need to store sensitive state parameters
- All tokens are stored in Cognito user attributes
- HandTerm stores only the Cognito tokens, not GitHub tokens

### Token Management

- GitHub tokens are stored in Cognito user attributes
- Tokens are refreshed automatically when expired
- Token updates are synchronized between GitHub and Cognito

### User Experience

```bash
$ github -l
Opening browser for GitHub authentication...
Device code copied to clipboard!
Waiting for authentication...
Successfully linked GitHub account!
```

The user experience is streamlined:
1. Single command to initiate
2. Browser opens automatically
3. Code is pre-copied to clipboard
4. Clear status updates in terminal
5. Works with any authentication method
