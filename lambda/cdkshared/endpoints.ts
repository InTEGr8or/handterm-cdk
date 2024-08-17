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
        BaseUrl: 'https://x7jzrjfuv8.execute-api.us-east-1.amazonaws.com',
        SignUp: '/signUp',
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
        PutFile: '/putFile'
    }
} as const