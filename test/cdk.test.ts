import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { HandTermCdkStack } from '../lib/cdk-stack';
import { mockClient } from 'aws-sdk-client-mock';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';

const ssmMock = mockClient(SSMClient);

beforeEach(() => {
  ssmMock.reset();
  ssmMock.on(GetParameterCommand).resolves({
    Parameter: {
      Value: JSON.stringify({
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
        issuerUrl: 'https://test-issuer.com'
      })
    }
  });
});

test('Stack Creation', () => {
  const app = new cdk.App();
  const stack = new HandTermCdkStack(app, 'MyTestStack');
  const template = Template.fromStack(stack);

  template.resourceCountIs('AWS::ApiGatewayV2::Api', 1);
  template.resourceCountIs('AWS::Cognito::UserPool', 1);
  template.resourceCountIs('AWS::Cognito::UserPoolClient', 1);
  template.resourceCountIs('AWS::S3::Bucket', 1);
  template.resourceCountIs('AWS::Lambda::Function', 12);  // Adjust this number based on your actual Lambda function count

  template.hasResourceProperties('AWS::ApiGatewayV2::Api', {
    Name: 'HandTermService',
  });

  template.hasResourceProperties('AWS::Cognito::UserPool', {
    UserPoolName: 'HandTermUserPool',
  });

  template.hasResourceProperties('AWS::S3::Bucket', {
    BucketName: 'handterm'
  });
});
