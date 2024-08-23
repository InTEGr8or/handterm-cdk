import { HttpApi, HttpMethod } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { IFunction, Runtime, Function as LambdaFunction, Code } from 'aws-cdk-lib/aws-lambda';
import { Role } from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

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
  authorizer?: HttpLambdaAuthorizer;
}

export function createLambdaIntegration(props: LambdaIntegrationProps) {
  const lambdaFunction = new LambdaFunction(props.scope, props.id, {
    runtime: Runtime.NODEJS_16_X,
    handler: props.handler,
    role: props.role,
    code: Code.fromAsset(props.codePath),
    environment: props.environment,
  });

  const integration = new HttpLambdaIntegration(`${props.id}-integration`, lambdaFunction);

  props.httpApi.addRoutes({
    path: props.path,
    methods: props.methods,
    integration: integration,
    authorizer: props.authorizer,
  });
}
