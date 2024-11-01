// cdk/lib/cdk-stack.ts
const { readFileSync } = require('fs');
const { join } = require('path');
const endpoints = JSON.parse(
  readFileSync(join(__dirname, '../lambda/cdkshared/endpoints.json'), 'utf8')
);

import { createLambdaIntegration } from './utils/lambdaUtils';
import {
  aws_cognito as cognito,
  aws_s3 as s3,
  aws_lambda as lambda,
  aws_logs as logs,
  aws_apigatewayv2 as apigatewayv2,
  RemovalPolicy,
  aws_iam as iam,
  App,
  CfnOutput,
  Stack,
  StackProps,
  aws_cloudwatch as cloudwatch,
} from "aws-cdk-lib";
import { Construct } from 'constructs';
import { HttpMethod, HttpApi, CorsHttpMethod } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { HttpLambdaAuthorizer, HttpLambdaResponseType } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import { Duration } from 'aws-cdk-lib';

const stackName = 'HandTermCdkStack';
const logPrefix = `/${stackName}/`;
const nodeRuntime = lambda.Runtime.NODEJS_18_X;

interface HandTermCdkStackProps extends StackProps {
  githubClientId: string;
  githubClientSecret: string;
  cognitoAppClientId: string;
}

export class HandTermCdkStack extends Stack {
  public userPool: cognito.UserPool;

  constructor(scope: Construct, id: string, props: HandTermCdkStackProps) {
    super(scope, id, props);
    this.initializeStack(props.githubClientId, props.githubClientSecret, props.cognitoAppClientId).catch(error => {
      console.error('Failed to initialize stack:', error);
      throw error;
    });
  }

  private async initializeStack(clientId: string, clientSecret: string, cognitoAppClientId: string): Promise<void> {
    console.log('GitHub Client ID:', clientId);
    console.log('GitHub Client Secret:', clientSecret ? '[REDACTED]' : 'Not set');
    console.log('Cognito App Client ID:', cognitoAppClientId);


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

    // GitHub Identity Provider is now created before the User Pool Client

    // Define the HTTP API
    const httpApi = new HttpApi(this, 'HandTermApi', {
      apiName: 'HandTermService',
      description: 'This service serves authentication requests.',
      corsPreflight: {
        allowOrigins: ['http://localhost:5173', 'https://handterm.com'],
        allowMethods: [CorsHttpMethod.GET, CorsHttpMethod.POST, CorsHttpMethod.PUT, CorsHttpMethod.DELETE, CorsHttpMethod.OPTIONS],
        allowHeaders: ['Content-Type', 'Authorization'],
        allowCredentials: true,
      },
    });

    // Add access logging to the API Gateway
    const logGroup = new logs.LogGroup(this, 'ApiGatewayAccessLogs', {
      logGroupName: `${logPrefix}ApiGatewayAccessLogs`,
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: RemovalPolicy.DESTROY
    });

    // Create or update the stage
    const stageName = 'prod';
    let stage = httpApi.defaultStage;

    if (!stage) {
      stage = new apigatewayv2.HttpStage(this, 'ProdStage', {
        httpApi,
        stageName,
        autoDeploy: true,
      });
    }

    // Configure access logging for the stage
    const cfnStage = stage.node.defaultChild as apigatewayv2.CfnStage;
    cfnStage.accessLogSettings = {
      destinationArn: logGroup.logGroupArn,
      format: JSON.stringify({
        requestId: "$context.requestId",
        ip: "$context.identity.sourceIp",
        requestTime: "$context.requestTime",
        httpMethod: "$context.httpMethod",
        routeKey: "$context.routeKey",
        status: "$context.status",
        protocol: "$context.protocol",
        responseLength: "$context.responseLength",
        integrationLatency: "$context.integrationLatency",
        authorizerError: "$context.authorizer.error"
      })
    };

    // Ensure the stage is set as the default stage for the API
    if (stage !== httpApi.defaultStage) {
      httpApi.addStage('default', {
        stageName,
        autoDeploy: true,
      });
    }

    // Output the log group name for easy access
    new CfnOutput(this, 'ApiGatewayLogGroupName', {
      value: logGroup.logGroupName,
      description: 'Name of the CloudWatch Log Group for API Gateway access logs',
    });

    // Cognito User Pool Client
    // Create the GitHub Identity Provider
    const githubProvider = new cognito.CfnUserPoolIdentityProvider(this, 'GitHubIdentityProvider', {
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
        name: 'name',
        picture: 'avatar_url',
        address: 'location',
        birthdate: 'created_at',
        zoneinfo: 'tz_offset',
        locale: 'locale'
      },
    });

    // Create the User Pool Client after the GitHub Identity Provider
    const userPoolClient = new cognito.UserPoolClient(this, 'HandTermCognitoUserPoolClient', {
      userPool,
      userPoolClientName: 'HandTermCognitoUserPoolClient',
      supportedIdentityProviders: [
        cognito.UserPoolClientIdentityProvider.COGNITO,
        cognito.UserPoolClientIdentityProvider.custom('GitHub')
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

    // Ensure the client is created after the identity provider
    userPoolClient.node.addDependency(githubProvider);

    // Output the Cognito User Pool Client ID
    new CfnOutput(this, 'CognitoUserPoolClientId', {
      value: userPoolClient.userPoolClientId,
      description: 'Cognito User Pool Client ID',
    });

    // Define or import the Logs Bucket
    let logsBucket: s3.IBucket;
    try {
      logsBucket = s3.Bucket.fromBucketName(this, 'ExistingLogsBucket', endpoints.aws.s3.bucketName);
    } catch {
      logsBucket = new s3.Bucket(this, 'LogsBucket', {
        bucketName: endpoints.aws.s3.bucketName,
        removalPolicy: RemovalPolicy.RETAIN,
        autoDeleteObjects: false,
      });
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

    // Remove any explicit permissions added to individual functions

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

    // Grant write permissions to the Lambda function for the log group
    authorizerLogGroup.grantWrite(authorizerFunction);

    // Add CloudWatch Logs permissions to the Lambda execution role
    authorizerFunction.addToRolePolicy(new iam.PolicyStatement({
      actions: ['logs:CreateLogStream', 'logs:PutLogEvents'],
      resources: [authorizerLogGroup.logGroupArn],
    }));

    const lambdaAuthorizer = new HttpLambdaAuthorizer('LambdaAuthorizer', authorizerFunction, {
      authorizerName: 'LambdaAuthorizer',
      identitySource: ['$request.header.Authorization'],
      resultsCacheTtl: Duration.seconds(0),
      responseTypes: [HttpLambdaResponseType.SIMPLE],
    });

    // Add a default route with the Lambda authorizer for all methods except OPTIONS
    httpApi.addRoutes({
      path: '/{proxy+}',
      methods: [HttpMethod.GET, HttpMethod.POST, HttpMethod.PUT, HttpMethod.DELETE, HttpMethod.PATCH],
      authorizer: lambdaAuthorizer,
      integration: new HttpLambdaIntegration('DefaultIntegration', authorizerFunction),
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

    const octokitLayer = new lambda.LayerVersion(this, 'OctokitLayer', {
      code: lambda.Code.fromAsset('lambdaLayer'),
      compatibleRuntimes: [lambda.Runtime.NODEJS_18_X],
      description: 'Octokit REST API client',
    });

    // Log the ARN of the created layer
    new CfnOutput(this, 'OctokitLayerArn', {
      value: octokitLayer.layerVersionArn,
      description: 'ARN of the Octokit Layer',
    });

    const defaultLambdaProps = {
      scope: this,
      role: lambdaExecutionRole,
      httpApi: httpApi,
      environment: {
        COGNITO_APP_CLIENT_ID: userPoolClient.userPoolClientId,
        COGNITO_USER_POOL_CLIENT_ID: userPoolClient.userPoolClientId,
        GITHUB_CLIENT_ID: clientId,
        GITHUB_CLIENT_SECRET: clientSecret,
        COGNITO_USER_POOL_ID: userPool.userPoolId,
        BUCKET_NAME: endpoints.aws.s3.bucketName,
        API_URL: httpApi.url || '',
      },
      layers: [octokitLayer],
    };

    createLambdaIntegration({
      ...defaultLambdaProps,
      id: 'SignUpFunction',
      handler: 'signUp.handler',
      codePath: 'dist/lambda/authentication',
      path: endpoints.api.SignUp,
      methods: [HttpMethod.POST],
    });


    // Log the SignUp function configuration
    console.log('SignUp Function Configuration:', {
      id: 'SignUpFunction',
      handler: 'signUp.handler',
      codePath: 'dist/lambda/authentication',
      path: endpoints.api.SignUp,
    });

    createLambdaIntegration({
      ...defaultLambdaProps,
      id: 'ConfirmSignUpFunction',
      handler: 'confirmSignUp.handler',
      codePath: 'dist/lambda/authentication',
      path: endpoints.api.ConfirmSignUp,
      methods: [HttpMethod.POST],
    });

    createLambdaIntegration({
      ...defaultLambdaProps,
      id: 'SignInFunction',
      handler: 'signIn.handler',
      codePath: 'dist/lambda/authentication',
      path: endpoints.api.SignIn,
      methods: [HttpMethod.POST],
    });

    createLambdaIntegration({
      ...defaultLambdaProps,
      id: 'RefreshTokenFunction',
      handler: 'refreshToken.handler',
      codePath: 'dist/lambda/authentication',
      path: endpoints.api.RefreshToken,
      methods: [HttpMethod.POST],
    });

    createLambdaIntegration({
      ...defaultLambdaProps,
      id: 'ChangePasswordFunction',
      handler: 'changePassword.handler',
      codePath: 'dist/lambda/authentication',
      path: endpoints.api.ChangePassword,
      methods: [HttpMethod.POST],
      authorizer: lambdaAuthorizer,
    });

    createLambdaIntegration({
      ...defaultLambdaProps,
      id: 'GetUserFunction',
      handler: 'getUser.handler',
      codePath: 'dist/lambda/userStorage',
      path: endpoints.api.GetUser,
      methods: [HttpMethod.GET],
      authorizer: lambdaAuthorizer,
    });

    // Add a log to check if this integration is being created
    console.log(`Created GetUserFunction integration with path: ${endpoints.api.GetUser}`);

    // Log the GetUser endpoint for debugging
    new CfnOutput(this, 'GetUserEndpoint', { value: `${httpApi.url}${endpoints.api.GetUser}` });

    createLambdaIntegration({
      ...defaultLambdaProps,
      id: 'SetUserFunction',
      handler: 'setUser.handler',
      codePath: 'dist/lambda/userStorage',
      path: endpoints.api.SetUser,
      methods: [HttpMethod.POST],
      authorizer: lambdaAuthorizer,
    });

    createLambdaIntegration({
      ...defaultLambdaProps,
      id: 'SaveLogFunction',
      handler: 'saveLog.handler',
      codePath: 'dist/lambda/userStorage',
      path: endpoints.api.SaveLog,
      methods: [HttpMethod.POST],
      authorizer: lambdaAuthorizer,
    });

    createLambdaIntegration({
      ...defaultLambdaProps,
      id: 'GetLogFunction',
      handler: 'getLog.handler',
      codePath: 'dist/lambda/userStorage',
      path: endpoints.api.GetLog,
      methods: [HttpMethod.POST, HttpMethod.GET],
      authorizer: lambdaAuthorizer,
    });

    createLambdaIntegration({
      ...defaultLambdaProps,
      id: 'ListLogFunction',
      handler: 'listLog.handler',
      codePath: 'dist/lambda/userStorage',
      path: endpoints.api.ListLog,
      methods: [HttpMethod.POST, HttpMethod.GET],
      authorizer: lambdaAuthorizer,
    });

    createLambdaIntegration({
      ...defaultLambdaProps,
      id: 'GetFileFunction',
      handler: 'getFile.handler',
      codePath: 'dist/lambda/userStorage',
      path: '/getFile',
      methods: [HttpMethod.GET],
      authorizer: lambdaAuthorizer,
    });

    createLambdaIntegration({
      ...defaultLambdaProps,
      id: 'PutFileFunction',
      handler: 'putFile.handler',
      codePath: 'dist/lambda/userStorage',
      path: endpoints.api.PutFile,
      methods: [HttpMethod.POST],
      authorizer: lambdaAuthorizer,
    });

    createLambdaIntegration({
      ...defaultLambdaProps,
      id: 'ListRecentReposFunction',
      handler: 'listRecentRepos.handler',
      codePath: 'dist/lambda/authentication',
      path: '/list-recent-repos',
      methods: [HttpMethod.GET],
      authorizer: lambdaAuthorizer,
      timeout: Duration.seconds(10), // Increase timeout to 10 seconds
    });

    const getRepoTreeFunction = createLambdaIntegration({
      ...defaultLambdaProps,
      id: 'GetRepoTreeFunction',
      handler: 'getRepoTree.handler',
      codePath: 'dist/lambda/authentication',
      path: '/get-repo-tree',
      methods: [HttpMethod.GET],
      authorizer: lambdaAuthorizer,
      environment: {
        ...defaultLambdaProps.environment,
        COGNITO_APP_CLIENT_ID: userPoolClient.userPoolClientId,
      },
    });

    // Log the Cognito App Client ID
    new CfnOutput(this, 'CognitoAppClientId', {
      value: userPoolClient.userPoolClientId,
      description: 'Cognito App Client ID',
    });

    // Log the ARN of the GetRepoTreeFunction
    if (getRepoTreeFunction) {
      new CfnOutput(this, 'GetRepoTreeFunctionArn', {
        value: getRepoTreeFunction.functionArn,
        description: 'ARN of the GetRepoTree Function',
      });
    }

    createLambdaIntegration({
      ...defaultLambdaProps,
      id: 'CheckSessionFunction',
      handler: 'checkSession.handler',
      codePath: 'dist/lambda/authentication',
      path: '/check-session',
      methods: [HttpMethod.GET],
    });

    createLambdaIntegration({
      ...defaultLambdaProps,
      id: 'SignOutFunction',
      handler: 'signOut.handler',
      codePath: 'dist/lambda/authentication',
      path: '/signout',
      methods: [HttpMethod.GET, HttpMethod.POST],
    });

    createLambdaIntegration({
      ...defaultLambdaProps,
      id: 'GitHubAuthRedirectFunction',
      handler: 'githubAuthRedirect.handler',
      codePath: 'dist/lambda/authentication',
      environment: {
        ...defaultLambdaProps.environment,
        REDIRECT_URI: `${httpApi.url}oauth_callback`,
      },
      path: '/github_auth',
      methods: [HttpMethod.GET],
    });

    createLambdaIntegration({
      ...defaultLambdaProps,
      id: 'OAuthCallbackFunction',
      handler: 'oauth_callback.handler',
      codePath: 'dist/lambda/authentication',
      environment: {
        ...defaultLambdaProps.environment,
        FRONTEND_URL: 'https://handterm.com', // Replace with your actual frontend URL
      },
      path: '/oauth_callback',
      methods: [HttpMethod.GET, HttpMethod.POST],
    });

    new CfnOutput(this, 'ApiEndpoint', { value: httpApi.url || '' });
    new CfnOutput(this, 'UserPoolId', { value: userPool.userPoolId });
    new CfnOutput(this, 'UserPoolClientId', { value: userPoolClient.userPoolClientId });
    new CfnOutput(this, 'IdentityPoolId', { value: identityPool.ref });
    new CfnOutput(this, 'BucketName', { value: logsBucket.bucketName });


    // Add CloudWatch dashboard
    const dashboard = new cloudwatch.Dashboard(this, 'HandTermDashboard', {
      dashboardName: 'HandTermLogs'
    });

    const logQuery = {
      logGroupNames: [`${logPrefix}*`],
      queryString: ` fields @timestamp, @message | sort @timestamp desc | limit 30 `,
    };

    dashboard.addWidgets(new cloudwatch.LogQueryWidget({
      title: 'Recent Logs',
      queryString: logQuery.queryString,
      logGroupNames: logQuery.logGroupNames,
    }));

    // Add outputs for CLI convenience
    new CfnOutput(this, 'LogGroupPrefix', { 
      value: logPrefix,
      description: 'Prefix for all log groups in this stack'
    });

    new CfnOutput(this, 'CloudWatchLogsQueryCommand', { 
      value: `aws logs start-query --log-group-name "${logPrefix}*" --start-time $(date -d '1 hour ago' +%s) --end-time $(date +%s) --query-string "${logQuery.queryString.replace(/\n/g, ' ').trim()}"`,
      description: 'AWS CLI command to query logs (Bash)'
    });
  }
}

const app = new App();
const githubClientId = process.env.GITHUB_CLIENT_ID;
const githubClientSecret = process.env.GITHUB_CLIENT_SECRET;

if (!githubClientId || !githubClientSecret) {
  console.error('Error: GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET must be set in the environment');
  console.error('Please ensure you have a .env file in the project root with these variables set');
  console.error('Example:');
  console.error('GITHUB_CLIENT_ID=your_client_id_here');
  console.error('GITHUB_CLIENT_SECRET=your_client_secret_here');
  process.exit(1);
}

new HandTermCdkStack(app, stackName, {
  githubClientId,
  githubClientSecret,
  cognitoAppClientId: process.env.COGNITO_APP_CLIENT_ID!,
});
