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
    api: {
        BaseUrl: 'https://bp7cm4l238.execute-api.us-east-1.amazonaws.com',
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
        CheckSession: '/checkSession',
        GetUser: '/getUser',
        SetUser: '/setUser',
        GetFile: '/getFile',
        PutFile: '/putFile',
        ListRecentRepos: '/list-recent-repos'
    }
} as const