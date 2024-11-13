import * as cdk from 'aws-cdk-lib';
import { readFileSync } from 'fs';
import { join } from 'path';
import { createLambdaIntegration } from './utils/lambdaUtils';
import {
  aws_cognito as cognito,
  aws_s3 as s3,
  aws_lambda as lambda,
  aws_logs as logs,
  RemovalPolicy,
  aws_iam as iam,
} from "aws-cdk-lib";
import { Construct } from 'constructs';
import { HttpMethod, HttpApi, CorsHttpMethod } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaAuthorizer, HttpLambdaResponseType } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import { Duration } from 'aws-cdk-lib';

const stackName = 'HandTermCdkStack';
const logPrefix = `/${stackName}/`;
const nodeRuntime = lambda.Runtime.NODEJS_18_X;

interface HandTermCdkStackProps extends cdk.StackProps {
  githubClientId: string;
  githubClientSecret: string;
  cognitoAppClientId: string;
}

// Define the structure for Lambda integrations
interface LambdaIntegration {
  id: string;
  handler: string;
  path: string;
  methods: HttpMethod[];
  authorizer?: HttpLambdaAuthorizer;
  timeout?: Duration;
}

export class HandTermCdkStack extends cdk.Stack {
  public readonly githubClientId: string;
  public readonly githubClientSecret: string;
  public readonly cognitoAppClientId: string;
  public userPool: cognito.UserPool;

  constructor(scope: Construct, id: string, props: HandTermCdkStackProps) {
    super(scope, id, props);

    this.githubClientId = props.githubClientId;
    this.githubClientSecret = props.githubClientSecret;
    this.cognitoAppClientId = props.cognitoAppClientId;

    const endpoints = JSON.parse(
      readFileSync(join(__dirname, '../lambda/cdkshared/endpoints.json'), 'utf8')
    );

    // Cognito User Pool with custom attributes
    const userPool = new cognito.UserPool(this, 'HandTermUserPool', {
      userPoolName: 'HandTermUserPool',
      selfSignUpEnabled: true,
      userVerification: {
        emailSubject: 'Verify your email for our app!',
        emailBody: 'Hello {username}, Thanks for signing up to our app! Your verification code is {####}',
        emailStyle: cognito.VerificationEmailStyle.CODE,
      },
      signInAliases: {
        username: true,
        email: true
      },
      signInCaseSensitive: false,
      passwordPolicy: {
        minLength: 8,
        requireUppercase: true,
        requireLowercase: true,
        requireDigits: true,
        requireSymbols: true,
      },
      autoVerify: { email: true },
      customAttributes: {
        gh_token: new cognito.StringAttribute({ mutable: true }),
        gh_refresh_token: new cognito.StringAttribute({ mutable: true }),
        gh_token_expires: new cognito.NumberAttribute({ mutable: true }),
        gh_refresh_expires: new cognito.NumberAttribute({ mutable: true }),
        gh_username: new cognito.StringAttribute({ mutable: true }),
        gh_id: new cognito.StringAttribute({ mutable: true }),
      },
    });

    this.userPool = userPool;

    // Create or import the Logs Bucket
    let logsBucket: s3.IBucket;
    try {
      logsBucket = s3.Bucket.fromBucketName(this, 'LogsBucket', endpoints.aws.s3.bucketName);
      console.log(`Using existing bucket: ${endpoints.aws.s3.bucketName}`);
    } catch {
      logsBucket = new s3.Bucket(this, 'LogsBucket', {
        bucketName: endpoints.aws.s3.bucketName,
        removalPolicy: RemovalPolicy.RETAIN,
        autoDeleteObjects: false,
      });
      console.log(`Created new bucket: ${endpoints.aws.s3.bucketName}`);
    }

    // Define the Lambda Execution Role
    const lambdaExecutionRole = new iam.Role(this, 'LambdaExecutionRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole')
      ],
      inlinePolicies: {
        CognitoAccess: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              actions: [
                'cognito-idp:AdminCreateUser',
                'cognito-idp:AdminGetUser',
                'cognito-idp:AdminUpdateUserAttributes',
                'cognito-idp:AdminSetUserPassword',
                'cognito-idp:ListUsers'
              ],
              resources: [userPool.userPoolArn]
            })
          ]
        }),
        S3Access: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              actions: [
                's3:GetObject',
                's3:PutObject',
                's3:ListBucket'
              ],
              resources: [
                logsBucket.bucketArn,
                `${logsBucket.bucketArn}/*`
              ]
            })
          ]
        })
      }
    });

    // Define the Lambda Authorizer
    const authorizerLogGroup = new logs.LogGroup(this, 'AuthorizerLogGroup', {
      logGroupName: `${logPrefix}AuthorizerFunction`,
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: RemovalPolicy.DESTROY
    });

    const authorizerFunction = new lambda.Function(this, 'AuthorizerFunction', {
      runtime: nodeRuntime,
      handler: 'authorizer.handler',
      role: lambdaExecutionRole,
      code: lambda.Code.fromAsset('dist/lambda/authentication'),
      logGroup: authorizerLogGroup,
      environment: {
        COGNITO_USER_POOL_ID: userPool.userPoolId,
      },
    });

    // Create the HTTP API
    const httpApi = new HttpApi(this, 'HandTermApi', {
      apiName: 'HandTermService',
      description: 'This service serves authentication requests.',
      corsPreflight: {
        allowOrigins: ['http://localhost:5173', 'https://handterm.com'],
        allowMethods: [CorsHttpMethod.GET, CorsHttpMethod.POST, CorsHttpMethod.PUT, CorsHttpMethod.DELETE, CorsHttpMethod.OPTIONS],
        allowHeaders: ['Content-Type', 'Authorization'],
        allowCredentials: true,
      },
      createDefaultStage: true,
    });

    // Create the GitHub Identity Provider
    const githubProvider = new cognito.CfnUserPoolIdentityProvider(this, 'GitHubIdentityProvider', {
      userPoolId: userPool.userPoolId,
      providerName: 'GitHub',
      providerType: 'OIDC',
      providerDetails: {
        client_id: this.githubClientId,
        client_secret: this.githubClientSecret,
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
        name: 'name',
        picture: 'avatar_url',
        address: 'location',
        birthdate: 'created_at',
        zoneinfo: 'tz_offset',
        locale: 'locale'
      },
    });

    // Create the User Pool Client
    const userPoolClient = new cognito.UserPoolClient(this, 'HandTermCognitoUserPoolClient', {
      userPool,
      userPoolClientName: 'HandTermCognitoUserPoolClient',
      supportedIdentityProviders: [
        cognito.UserPoolClientIdentityProvider.COGNITO,
        cognito.UserPoolClientIdentityProvider.custom(githubProvider.ref)
      ],
      oAuth: {
        callbackUrls: [`${httpApi.url}${endpoints.api.OAuthCallback}`],
        logoutUrls: [`${httpApi.url}${endpoints.api.SignOut}`]
      },
      authFlows: {
        adminUserPassword: true,
        custom: true,
        userPassword: true,
        userSrp: true
      }
    });

    // Create the Lambda Authorizer
    const lambdaAuthorizer = new HttpLambdaAuthorizer('LambdaAuthorizer', authorizerFunction, {
      authorizerName: 'LambdaAuthorizer',
      identitySource: ['$request.header.Authorization'],
      resultsCacheTtl: Duration.seconds(0),
      responseTypes: [HttpLambdaResponseType.SIMPLE],
    });

    // Create the Octokit Layer
    const octokitLayer = new lambda.LayerVersion(this, 'OctokitLayer', {
      code: lambda.Code.fromAsset('lambdaLayer'),
      compatibleRuntimes: [lambda.Runtime.NODEJS_18_X],
      description: 'Octokit REST API client',
    });

    const redirectUri = httpApi.url + endpoints.api.OAuthCallback.replace('/','');
    console.log(redirectUri);

    // Define common Lambda properties
    const defaultLambdaProps = {
      scope: this,
      role: lambdaExecutionRole,
      httpApi: httpApi,
      environment: {
        COGNITO_APP_CLIENT_ID: userPoolClient.userPoolClientId,
        COGNITO_USER_POOL_CLIENT_ID: userPoolClient.userPoolClientId,
        GITHUB_CLIENT_ID: this.githubClientId,
        GITHUB_CLIENT_SECRET: this.githubClientSecret,
        COGNITO_USER_POOL_ID: userPool.userPoolId,
        BUCKET_NAME: endpoints.aws.s3.bucketName,
        API_URL: httpApi.url || '',
        REDIRECT_URI: redirectUri
      },
      layers: [octokitLayer],
    };

    // Create Lambda integrations for each endpoint
    const lambdaIntegrations: LambdaIntegration[] = [
      {
        id: 'SignUpFunction',
        handler: 'signUp.handler',
        path: endpoints.api.SignUp,
        methods: [HttpMethod.POST],
      },
      {
        id: 'ConfirmSignUpFunction',
        handler: 'confirmSignUp.handler',
        path: endpoints.api.ConfirmSignUp,
        methods: [HttpMethod.POST],
      },
      {
        id: 'SignInFunction',
        handler: 'signIn.handler',
        path: endpoints.api.SignIn,
        methods: [HttpMethod.POST],
      },
      {
        id: 'SignOutFunction',
        handler: 'signOut.handler',
        path: endpoints.api.SignOut,
        methods: [HttpMethod.GET, HttpMethod.POST],
      },
      {
        id: 'ChangePasswordFunction',
        handler: 'changePassword.handler',
        path: endpoints.api.ChangePassword,
        methods: [HttpMethod.POST],
        authorizer: lambdaAuthorizer,
      },
      {
        id: 'RefreshTokenFunction',
        handler: 'refreshToken.handler',
        path: endpoints.api.RefreshToken,
        methods: [HttpMethod.POST],
      },
      {
        id: 'CheckSessionFunction',
        handler: 'checkSession.handler',
        path: endpoints.api.CheckSession,
        methods: [HttpMethod.GET],
      },
      {
        id: 'GetUserFunction',
        handler: 'getUser.handler',
        path: endpoints.api.GetUser,
        methods: [HttpMethod.GET],
        authorizer: lambdaAuthorizer,
      },
      {
        id: 'SetUserFunction',
        handler: 'setUser.handler',
        path: endpoints.api.SetUser,
        methods: [HttpMethod.POST],
        authorizer: lambdaAuthorizer,
      },
      {
        id: 'ListRecentReposFunction',
        handler: 'listRecentRepos.handler',
        path: endpoints.api.ListRecentRepos,
        methods: [HttpMethod.GET],
        authorizer: lambdaAuthorizer,
        timeout: Duration.seconds(10),
      },
      {
        id: 'GetRepoTreeFunction',
        handler: 'getRepoTree.handler',
        path: endpoints.api.GetRepoTree,
        methods: [HttpMethod.GET],
        authorizer: lambdaAuthorizer,
      },
      {
        id: 'GitHubAuthRedirectFunction',
        handler: 'githubAuthRedirect.handler',
        path: endpoints.api.GitHubAuth,
        methods: [HttpMethod.GET],
      },
      {
        id: 'OAuthCallbackFunction',
        handler: 'oauth_callback.handler',
        path: endpoints.api.OAuthCallback,
        methods: [HttpMethod.GET, HttpMethod.POST],
      },
    ];

    // Create all Lambda integrations
    lambdaIntegrations.forEach(integration => {
      createLambdaIntegration({
        ...defaultLambdaProps,
        id: integration.id,
        handler: integration.handler,
        codePath: integration.id.includes('User') || integration.id.includes('Log') || integration.id.includes('File')
          ? 'dist/lambda/userStorage'
          : 'dist/lambda/authentication',
        path: integration.path,
        methods: integration.methods,
        authorizer: integration.authorizer,
        timeout: integration.timeout,
      });
    });

    // Add outputs
    new cdk.CfnOutput(this, 'ApiEndpoint', { value: httpApi.url || '' });
    new cdk.CfnOutput(this, 'RedirectUri', { value: defaultLambdaProps.environment.REDIRECT_URI })
    new cdk.CfnOutput(this, 'UserPoolId', { value: userPool.userPoolId });
    new cdk.CfnOutput(this, 'UserPoolClientId', { value: userPoolClient.userPoolClientId });
    new cdk.CfnOutput(this, 'BucketName', { value: logsBucket.bucketName });
  }
}
