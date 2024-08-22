// cdk/lib/cdk-stack.ts
import { ENDPOINTS } from '../lambda/cdkshared/endpoints';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { getGitHubSecrets, GitHubSecrets } from './utils/githubSecrets';
import {
  aws_cognito as cognito,
  aws_s3 as s3,
  aws_lambda as lambda,
  aws_iam as iam,
  App,
  CfnOutput,
  Stack,
  StackProps,
  Duration
} from "aws-cdk-lib";
import { Construct } from 'constructs';
import { HttpMethod, HttpApi, CorsHttpMethod } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations'; // This path is illustrative and likely incorrect
import { HttpLambdaAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import { IFunction } from 'aws-cdk-lib/aws-lambda';


const nodeRuntime = lambda.Runtime.NODEJS_16_X;

export class HandTermCdkStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);
    this.initializeStack();
  }

  private async initializeStack() {
    const { clientId, clientSecret, issuerUrl } = await getGitHubSecrets();

    console.log("GitHub Client Secret: " + clientSecret);
    console.log("GitHub Client ID: " + clientId);
    console.log("GitHub Issuer URL: " + issuerUrl);
    const allowHeaders = [
      'Content-Type',
      'X-Amz-Date',
      'Authorization',
      'X-Api-Key',
      'X-Requested-With',
      'sec-ch-ua',
      'sec-ch-ua-mobile',
      'sec-ch-ua-platform'
    ];
    // Cognito User Pool
    const userPool = new cognito.UserPool(this, 'HandTermUserPool', {
      userPoolName: 'HandTermUserPool',
      selfSignUpEnabled: true,
      userVerification: {
        emailSubject: 'Verify your email for our app!',
        emailBody: 'Hello {username}, Thanks for signing up to our app! Your verification code is {####}',
        emailStyle: cognito.VerificationEmailStyle.CODE,
      },
      signInAliases: {
        email: true
      },
      passwordPolicy: {
        minLength: 8,
        requireUppercase: true,
        requireLowercase: true,
        requireDigits: true,
        requireSymbols: true,
      },
      autoVerify: { email: true }
    });

    new cognito.CfnUserPoolIdentityProvider(this, 'GitHubIdentityProvider', {
      userPoolId: userPool.userPoolId,
      providerName: 'GitHub',
      providerType: 'OIDC',
      providerDetails: {
        client_id: clientId,
        client_secret: clientSecret,
        attributes_request_method: 'GET',
        oidc_issuer: 'https://github.com',
        authorize_scopes: 'openid user:email',
        authorize_url: 'https://github.com/login/oauth/authorize',
        token_url: 'https://github.com/login/oauth/access_token',
        attributes_url: 'https://api.github.com/user',
        jwks_uri: 'https://token.actions.githubusercontent.com/.well-known/jwks'
      },
      attributeMapping: {
        email: 'email',
        preferredUsername: 'login',
        name: 'name'
      }
    });

    // Define the HTTP API
    const httpApi = new HttpApi(this, 'HandTermApi', {
      apiName: 'HandTermService',
      description: 'This service serves authentication requests.',
      // CORS configuration if needed
      corsPreflight: {
        allowOrigins: ['http://localhost:5173', 'https://handterm.com'],
        allowMethods: [CorsHttpMethod.GET, CorsHttpMethod.POST, CorsHttpMethod.OPTIONS],
        allowHeaders: ['Content-Type', 'Authorization'],
        allowCredentials: true,
      },
    });

    // Cognito User Pool Client
    const userPoolClient = new cognito.UserPoolClient(this, 'UserPoolClient', {
      userPool,
      supportedIdentityProviders: [
        cognito.UserPoolClientIdentityProvider.COGNITO,
        cognito.UserPoolClientIdentityProvider.custom('GitHub')
      ],
      oAuth: {
        callbackUrls: [`${httpApi.url}oauth_callback`],
        logoutUrls: [`${httpApi.url}logout`]
      }
    });

    // Ensure the client is created after the identity provider
    userPoolClient.node.addDependency(userPool);

    // Define the Lambda Execution Role
    const lambdaExecutionRole = new iam.Role(this, 'LambdaExecutionRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole')
      ]
    });

    // Define the Lambda Authorizer
    const lambdaAuthorizer = new HttpLambdaAuthorizer('LambdaAuthorizer', {
      handler: new lambda.Function(this, 'AuthorizerFunction', {
        runtime: nodeRuntime,
        handler: 'authorizer.handler',
        role: lambdaExecutionRole,
        code: lambda.Code.fromAsset('lambda/authentication'),
      }),
    });

    // Define the Identity Pool
    const identityPool = new cognito.CfnIdentityPool(this, 'IdentityPool', {
      allowUnauthenticatedIdentities: false,
      cognitoIdentityProviders: [
        {
          clientId: userPoolClient.userPoolClientId,
          providerName: userPool.userPoolProviderName,
        },
      ],
    });

    // Define the Logs Bucket
    const logsBucket = new s3.Bucket(this, 'LogsBucket', {
      removalPolicy: s3.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const signUpLambda = new lambda.Function(this, 'SignUpFunction', {
      runtime: nodeRuntime,
      handler: 'signUp.handler',
      role: lambdaExecutionRole,
      code: lambda.Code.fromAsset('lambda/authentication'),
      environment: {
        COGNITO_APP_CLIENT_ID: userPoolClient.userPoolClientId,
      }
    });
    });
    const signUpIntegration = new HttpLambdaIntegration('signup-integration', signUpLambda);
    httpApi.addRoutes({
      path: ENDPOINTS.api.SignUp,
      methods: [HttpMethod.POST],
      integration: signUpIntegration,
    })

    const signInLambda = new lambda.Function(this, 'SignInFunction', {
      runtime: nodeRuntime,
      handler: 'signIn.handler',
      role: lambdaExecutionRole,
      code: lambda.Code.fromAsset('lambda/authentication'),
      environment: {
        COGNITO_APP_CLIENT_ID: userPoolClient.userPoolClientId,
      }
    });

    httpApi.addRoutes({
      path: ENDPOINTS.api.SignIn,
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration(
        'post-user-signin',
        signInLambda
      ),
    })

    const refreshTokenLambda = new lambda.Function(this, 'RefreshTokenFunction', {
      runtime: nodeRuntime,
      handler: 'refreshToken.handler',
      role: lambdaExecutionRole,
      code: lambda.Code.fromAsset('lambda/authentication'),
      environment: {
        COGNITO_APP_CLIENT_ID: userPoolClient.userPoolClientId,
      }
    });

    httpApi.addRoutes({
      path: ENDPOINTS.api.RefreshToken,
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration(
        'post-user-signin',
        refreshTokenLambda
      ),
    })

    const changePasswordLambda = new lambda.Function(this, 'ChangePasswordFunction', {
      runtime: nodeRuntime,
      handler: 'changePassword.handler',
      role: lambdaExecutionRole,
      code: lambda.Code.fromAsset('lambda/authentication'),
      environment: {
        COGNITO_APP_CLIENT_ID: userPoolClient.userPoolClientId,
      }
    });
    const changePasswordIntegration = new HttpLambdaIntegration('change-password-integration', changePasswordLambda);

    httpApi.addRoutes({
      path: ENDPOINTS.api.ChangePassword,
      authorizer: lambdaAuthorizer,
      methods: [HttpMethod.POST],
      integration: changePasswordIntegration,
    })

    const getUserLambda = new lambda.Function(this, 'GetUserFunction', {
      runtime: nodeRuntime,
      handler: 'getUser.handler',
      role: lambdaExecutionRole,
      code: lambda.Code.fromAsset('lambda/userStorage'),
      environment: {
        COGNITO_APP_CLIENT_ID: userPoolClient.userPoolClientId,
      }
    });
    const getUserIntegration = new HttpLambdaIntegration('get-user-integration', getUserLambda);
    httpApi.addRoutes({
      path: ENDPOINTS.api.GetUser,
      authorizer: lambdaAuthorizer,
      methods: [HttpMethod.GET],
      integration: getUserIntegration,
    })

    const setUserLambda = new lambda.Function(this, 'SetUserFunction', {
      runtime: nodeRuntime,
      handler: 'setUser.handler',
      role: lambdaExecutionRole,
      code: lambda.Code.fromAsset('lambda/userStorage'),
      environment: {
        COGNITO_APP_CLIENT_ID: userPoolClient.userPoolClientId,
      }
    });
    const setUserIntegration = new HttpLambdaIntegration('set-user-integration', setUserLambda);
    httpApi.addRoutes({
      path: ENDPOINTS.api.SetUser,
      authorizer: lambdaAuthorizer,
      methods: [HttpMethod.POST],
      integration: setUserIntegration,
    })

    const saveLogLambda = new lambda.Function(this, 'SaveLogFunction', {
      runtime: nodeRuntime,
      handler: 'saveLog.handler',
      role: lambdaExecutionRole,
      code: lambda.Code.fromAsset('lambda/userStorage'),
      environment: {
        COGNITO_APP_CLIENT_ID: userPoolClient.userPoolClientId,
      }
    });
    const saveLogIntegration = new HttpLambdaIntegration('save-log-integration', saveLogLambda);
    httpApi.addRoutes({
      path: ENDPOINTS.api.SaveLog,
      authorizer: lambdaAuthorizer,
      methods: [HttpMethod.POST],
      integration: saveLogIntegration,
    })

    const getLogLambda = new lambda.Function(this, 'GetLogFunction', {
      runtime: nodeRuntime,
      handler: 'getLog.handler',
      role: lambdaExecutionRole,
      code: lambda.Code.fromAsset('lambda/userStorage'),
      environment: {
        COGNITO_APP_CLIENT_ID: userPoolClient.userPoolClientId,
      }
    });
    const getLogIntegration = new HttpLambdaIntegration('get-log-integration', getLogLambda);
    httpApi.addRoutes({
      path: ENDPOINTS.api.GetLog,
      authorizer: lambdaAuthorizer,
      methods: [HttpMethod.POST, HttpMethod.GET],
      integration: getLogIntegration,
    })

    const listLogLambda = new lambda.Function(this, 'ListLogFunction', {
      runtime: nodeRuntime,
      handler: 'listLog.handler',
      role: lambdaExecutionRole,
      code: lambda.Code.fromAsset('lambda/userStorage'),
      environment: {
        COGNITO_APP_CLIENT_ID: userPoolClient.userPoolClientId,
      }
    });
    const listLogIntegration = new HttpLambdaIntegration('list-log-integration', listLogLambda);
    httpApi.addRoutes({
      path: ENDPOINTS.api.ListLog,
      authorizer: lambdaAuthorizer,
      methods: [HttpMethod.POST, HttpMethod.GET],
      integration: listLogIntegration,
    })

    const getFileLambda = new lambda.Function(this, 'GetFileFunction', {
      runtime: nodeRuntime,
      handler: 'getFile.handler',
      role: lambdaExecutionRole,
      code: lambda.Code.fromAsset('lambda/userStorage'),
      environment: {
        COGNITO_APP_CLIENT_ID: userPoolClient.userPoolClientId,
      }
    });
    const getFileIntegration = new HttpLambdaIntegration('get-file-integration', getFileLambda);
    httpApi.addRoutes({
      path: ENDPOINTS.api.GetFile,
      authorizer: lambdaAuthorizer,
      methods: [HttpMethod.GET],
      integration: getFileIntegration,
    })

    const putFileLambda = new lambda.Function(this, 'PutFileFunction', {
      runtime: nodeRuntime,
      handler: 'putFile.handler',
      role: lambdaExecutionRole,
      code: lambda.Code.fromAsset('lambda/userStorage'),
      environment: {
        COGNITO_APP_CLIENT_ID: userPoolClient.userPoolClientId,
      }
    });
    const putFileIntegration = new HttpLambdaIntegration('put-file-integration', putFileLambda);
    httpApi.addRoutes({
      path: ENDPOINTS.api.PutFile,
      authorizer: lambdaAuthorizer,
      methods: [HttpMethod.POST],
      integration: putFileIntegration,
    })

    const logoutLambda = new lambda.Function(this, 'LogoutFunction', {
      runtime: nodeRuntime,
      handler: 'logout.handler',
      role: lambdaExecutionRole,
      code: lambda.Code.fromAsset('lambda/authentication'),
    });

    const logoutIntegration = new HttpLambdaIntegration('logout-integration', logoutLambda);
    httpApi.addRoutes({
      path: '/logout',
      methods: [HttpMethod.GET, HttpMethod.POST],
      integration: logoutIntegration,
    });

    const oauthCallbackLambda = new lambda.Function(this, 'OAuthCallbackFunction', {
      runtime: nodeRuntime,
      handler: 'oauth_callback.handler',
      role: lambdaExecutionRole,
      code: lambda.Code.fromAsset('lambda/authentication'),
    });

    const oauthCallbackIntegration = new HttpLambdaIntegration('oauth-callback-integration', oauthCallbackLambda);
    httpApi.addRoutes({
      path: '/oauth_callback',
      methods: [HttpMethod.GET, HttpMethod.POST],
      integration: oauthCallbackIntegration,
    });
    new CfnOutput(this, 'ApiEndpoint', { value: httpApi.url || '' });
    new CfnOutput(this, 'UserPoolId', { value: userPool.userPoolId });
    new CfnOutput(this, 'UserPoolClientId', { value: userPoolClient.userPoolClientId });
    new CfnOutput(this, 'IdentityPoolId', { value: identityPool.ref });
    new CfnOutput(this, 'BucketName', { value: logsBucket.bucketName });
  }
}

const app = new App();
new HandTermCdkStack(app, 'HandTermCdkStack');
