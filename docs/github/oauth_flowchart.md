flowchart TB
    A[User] -->|1. Runs github -l| B(HandTerm)
    B -->|2. Requests Device Code| C[Backend API]
    C -->|3. Gets Device Code| D[GitHub API]
    D -->|4. Returns Codes & URL| C
    C -->|5. Returns Auth Info| B
    B -->|6. Opens Browser| E[Browser]
    B -->|7. Copies Code| F[Clipboard]
    E -->|8. User Enters Code| G[GitHub OAuth]
    G -->|9. User Completes 2FA| H[GitHub Auth]

    subgraph "Polling Loop"
        I[HandTerm] -->|10. Check Status| J[Backend API]
        J -->|11. Check Token| K[GitHub API]
        K -->|12. Return Status| J
        J -->|13. Return Status| I
    end

    H -->|14. Auth Complete| K
    K -->|15. Returns Access Token| J
    J -->|16. Stores Token| L[Cognito User Pool]
    L -->|17. Confirms Storage| J
    J -->|18. Returns Success| I
    I -->|19. Shows Success| A

    subgraph "Subsequent API Calls"
        M[HandTerm] -->|20. Request Data| N[Backend API]
        N -->|21. Get Token| L
        N -->|22. Use Token| O[GitHub API]
        O -->|23. Return Data| N
        N -->|24. Return Data| M
        M -->|25. Display Data| A
    end

    subgraph "Data Elements"
        DE1[Device Code]
        DE2[User Code]
        DE3[Verification URI]
        DE4[Access Token]
        DE5[GitHub Username]
        DE6[GitHub User ID]
    end

    subgraph "Token Management"
        TM1[Check Token Expiry]
        TM2[Request New Token]
        TM3[Update Token in Cognito]
        TM4[Use New Token]
    end

    subgraph "User Experience"
        UX1[Single Command]
        UX2[Auto Browser Launch]
        UX3[Code in Clipboard]
        UX4[2FA Support]
        UX5[Status Updates]
    end
