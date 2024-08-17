import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import * as Cdk from '../lib/cdk-stack';

// example test. To run these tests, uncomment this file along with the
// example resource in lib/cdk-stack.ts
test('API Gateway REST API Created', () => {
    const app = new cdk.App();
    // WHEN
    const stack = new Cdk.HandTermCdkStack(app, 'MyTestStack');
    // THEN
    const template = Template.fromStack(stack);
    template.hasResourceProperties('AWS::ApiGateway::RestApi', {
        Name: 'api',
    });
});

test('Cognito User Pool and Client Created', () => {
  const app = new cdk.App();
  const stack = new Cdk.HandTermCdkStack(app, 'MyTestStack');
  
  const template = Template.fromStack(stack);

  // Test for the User Pool
  template.hasResourceProperties('AWS::Cognito::UserPool', {
    UserPoolName: 'HandTermUserPool',
  });

  // Test for the User Pool Client
  template.hasResource('AWS::Cognito::UserPoolClient', {
    Properties: {
      ExplicitAuthFlows: [
        'ALLOW_USER_SRP_AUTH',
        'ALLOW_REFRESH_TOKEN_AUTH'
      ]
    }
  });
});

test('S3 Bucket for User Logs Created', () => {
  const app = new cdk.App();
  const stack = new Cdk.HandTermCdkStack(app, 'MyTestStack');
  
  const template = Template.fromStack(stack);

  // Test for the S3 Bucket
  template.hasResourceProperties('AWS::S3::Bucket', {
    BucketName: 'handterm'
  });
});

test('Lambda@Edge Function for HttpOnly Cookies Created', () => {
  const app = new cdk.App();
  const stack = new Cdk.HandTermCdkStack(app, 'MyTestStack');
  
  const template = Template.fromStack(stack);

  // Test for the Lambda@Edge function
  template.hasResourceProperties('AWS::Lambda::Function', {
    Description: 'A Lambda@Edge function for HttpOnly Cookies'
  });
});