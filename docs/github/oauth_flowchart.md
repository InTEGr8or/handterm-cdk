```mermaid
flowchart TB
    A[User] -->|1. Initiates GitHub Auth| B(Frontend)
    B -->|2. Redirects to GitHub| C[GitHub OAuth]
    C -->|3. User Authorizes App| D[GitHub Callback]
    D -->|4. Returns Code| E[Backend OAuth Callback]
    E -->|5. Exchanges Code for Tokens| F[GitHub API]
    F -->|6. Returns Access & Refresh Tokens| E
    E -->|7. Stores Tokens in Cognito| G[Cognito User Pool]
    G -->|8. Confirms Storage| E
    E -->|9. Redirects with Success| B
    B -->|10. Requests GitHub Data| H[Backend API]
    H -->|11. Retrieves Tokens| G
    H -->|12. Checks Token Expiry| I{Token Expired?}
    I -->|No| J[Use Access Token]
    I -->|Yes| K[Refresh Token Flow]
    K -->|13. Requests New Tokens| F
    F -->|14. Returns New Tokens| K
    K -->|15. Updates Tokens| G
    K --> J
    J -->|16. Makes API Request| L[GitHub API]
    L -->|17. Returns Data| H
    H -->|18. Sends Data| B
    B -->|19. Displays Data| A

subgraph "Data Elements"
    DE1[Access Token]
    DE2[Refresh Token]
    DE3[Token Expiry]
    DE4[GitHub Username]
    DE5[GitHub User ID]
end

subgraph "Refresh Process"
    RP1[Check Token Expiry]
    RP2[Use Refresh Token]
    RP3[Update Tokens in Cognito]
    RP4[Use New Access Token]
end
```