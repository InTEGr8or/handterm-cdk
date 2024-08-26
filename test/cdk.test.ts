import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import * as Cdk from '../lib/cdk-stack';
import { getGitHubSecrets } from '../lib/utils/githubSecrets';

jest.mock('../lib/utils/githubSecrets');

const mockedGetGitHubSecrets = getGitHubSecrets as jest.MockedFunction<typeof getGitHubSecrets>;

beforeEach(() => {
  mockedGetGitHubSecrets.mockResolvedValue({
    clientId: 'test-client-id',
    clientSecret: 'test-client-secret',
    issuerUrl: 'https://test-issuer.com'
  });
});

test('API Gateway REST API Created', async () => {
  const app = new cdk.App();
  const stack = await Cdk.HandTermCdkStack.create(app, 'MyTestStack');
  const template = Template.fromStack(stack);
  
  template.hasResourceProperties('AWS::ApiGatewayV2::Api', {
    Name: 'HandTermService',
  });
});

test('Cognito User Pool and Client Created', async () => {
  const app = new cdk.App();
  const stack = await Cdk.HandTermCdkStack.create(app, 'MyTestStack');
  const template = Template.fromStack(stack);

  template.hasResourceProperties('AWS::Cognito::UserPool', {
    UserPoolName: 'HandTermUserPool',
  });

  template.hasResourceProperties('AWS::Cognito::UserPoolClient', {
    UserPoolId: {
      Ref: stack.getLogicalId(stack.userPool.node.defaultChild as cdk.CfnElement)
    },
    ExplicitAuthFlows: [
      'ALLOW_USER_PASSWORD_AUTH',
      'ALLOW_USER_SRP_AUTH',
      'ALLOW_REFRESH_TOKEN_AUTH'
    ]
  });
});

test('S3 Bucket for User Logs Created', async () => {
  const app = new cdk.App();
  const stack = await Cdk.HandTermCdkStack.create(app, 'MyTestStack');
  const template = Template.fromStack(stack);

  template.hasResourceProperties('AWS::S3::Bucket', {
    BucketName: 'handterm'
  });
});

test('Lambda Functions Created', async () => {
  const app = new cdk.App();
  const stack = await Cdk.HandTermCdkStack.create(app, 'MyTestStack');
  const template = Template.fromStack(stack);

  // Test for the Lambda functions
  template.resourceCountIs('AWS::Lambda::Function', 12);  // Adjust this number based on your actual Lambda function count
});
