import { HttpApi, HttpMethod } from 'aws-cdk-lib/aws-apigatewayv2';
import { LayerVersion } from 'aws-cdk-lib/aws-lambda';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { Runtime, Function as LambdaFunction, Code } from 'aws-cdk-lib/aws-lambda';
import { Role } from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { HttpLambdaAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import * as logs from 'aws-cdk-lib/aws-logs';

interface LambdaIntegrationProps {
  scope: Construct;
  id: string;
  handler: string;
  role: Role;
  codePath: string;
  environment: { [key: string]: string };
  httpApi: HttpApi;
  path: string;
  methods: HttpMethod[];
  logGroup?: logs.ILogGroup;
  authorizer?: HttpLambdaAuthorizer;
  layers?: LayerVersion[];
}

export function createLambdaIntegration(props: LambdaIntegrationProps) {
  const lambdaFunction = new LambdaFunction(props.scope, props.id, {
    runtime: Runtime.NODEJS_18_X,
    handler: props.handler,
    role: props.role,
    code: Code.fromAsset(props.codePath),
    environment: props.environment,
    layers: props.layers,
    logRetention: props.logGroup ? undefined : logs.RetentionDays.ONE_WEEK,
  });

  if (props.logGroup) {
    props.logGroup.grantWrite(lambdaFunction);
  }

  const integration = new HttpLambdaIntegration(`${props.id}-integration`, lambdaFunction);

  props.httpApi.addRoutes({
    path: props.path,
    methods: props.methods,
    integration: integration,
    authorizer: props.authorizer,
  });
}
