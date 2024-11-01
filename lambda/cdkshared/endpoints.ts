// shared/endpoints.ts

export const ENDPOINTS = {
    aws: {
        cognito: {
            url: 'https://cognito-idp.us-east-1.amazonaws.com',
        },
        s3: {
            url: 'https://s3.amazonaws.com',
            bucketName: 'handterm',
            userKey: 'user_data/{{userId}}/'
        },
    },
    github: {
        api: 'https://api.github.com'
    },
    api: {
        BaseUrl: 'https://22k5nam6ed.execute-api.us-east-1.amazonaws.com',
        SignUp: '/signUp',
        ConfirmSignUp: '/confirm-signup',
        GetLog: '/getLog',
        ListLog: '/listLog',
        SaveLog: '/saveLog',
        SignIn: '/signIn',
        SignOut: '/signOut',
        ChangePassword: '/changePassword',
        TokenHandler: '/tokenHandler',
        RefreshToken: '/refreshToken',
        CheckSession: '/check-session',
        GetUser: '/getUser',
        SetUser: '/setUser',
        GetFile: '/getFile',
        PutFile: '/putFile',
        ListRecentRepos: '/list-recent-repos',
        GetRepoTree: '/get-repo-tree',
        GitHubAuth: '/github_auth',
        OAuthCallback: '/oauth_callback'
    }
} as const