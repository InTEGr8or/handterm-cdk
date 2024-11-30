import { HttpApi, HttpMethod } from 'aws-cdk-lib/aws-apigatewayv2';
import { LayerVersion } from 'aws-cdk-lib/aws-lambda';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { Runtime, Function as LambdaFunction, Code } from 'aws-cdk-lib/aws-lambda';
import { Role, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { HttpLambdaAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Duration, RemovalPolicy, Stack } from 'aws-cdk-lib';

interface LambdaIntegrationProps {
  scope: Construct;
  id: string;
  handler: string;
  role: Role;
  codePath: string;
  environment: { [key: string]: string };
  httpApi: HttpApi;
  apiPath: string;
  methods: HttpMethod[];
  authorizer?: HttpLambdaAuthorizer;
  layers?: LayerVersion[];
  timeout?: Duration;
}

export function createLambdaIntegration(props: LambdaIntegrationProps) {
  const stack = Stack.of(props.scope);
  const logGroup = new logs.LogGroup(props.scope, `${props.id}LogGroup`, {
    logGroupName: `/${stack.stackName}/${props.id}`,
    retention: logs.RetentionDays.ONE_WEEK,
    removalPolicy: RemovalPolicy.DESTROY
  });

  const lambdaFunction = new LambdaFunction(props.scope, props.id, {
    runtime: Runtime.NODEJS_20_X,
    handler: props.handler,
    role: props.role,
    code: Code.fromAsset(props.codePath),
    environment: {
      ...props.environment,
    },
    description: props.codePath,
    layers: props.layers,
    logGroup: logGroup,
    timeout: props.timeout || Duration.seconds(5),
  });

  // Grant write permissions to the Lambda function for the log group
  logGroup.grantWrite(lambdaFunction);

  // Add CloudWatch Logs permissions to the Lambda execution role
  lambdaFunction.addToRolePolicy(new PolicyStatement({
    actions: ['logs:CreateLogStream', 'logs:PutLogEvents'],
    resources: [logGroup.logGroupArn],
  }));

  const integration = new HttpLambdaIntegration(`${props.id}-integration`, lambdaFunction);

  props.httpApi.addRoutes({
    path: props.apiPath,
    methods: props.methods,
    integration: integration,
    authorizer: props.authorizer,
  });

  return lambdaFunction;
}
