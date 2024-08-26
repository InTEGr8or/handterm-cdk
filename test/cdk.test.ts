import * as cdk from 'aws-cdk-lib';
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

test('Stack can be instantiated', () => {
  const app = new cdk.App();
  const stack = new HandTermCdkStack(app, 'MyTestStack');
  expect(stack).toBeDefined();
});
