import { handler } from '../authentication/authorizer';
import { APIGatewayTokenAuthorizerEvent } from 'aws-lambda';
import { mockClient } from 'aws-sdk-client-mock';
import { CognitoIdentityProviderClient, GetUserCommand } from '@aws-sdk/client-cognito-identity-provider';

const cognitoMock = mockClient(CognitoIdentityProviderClient);

describe('Authorizer', () => {
  beforeEach(() => {
    cognitoMock.reset();
    process.env.COGNITO_USER_POOL_ID = 'test-pool-id';
  });

  it('should deny access when no Authorization header is provided', async () => {
    const event: APIGatewayTokenAuthorizerEvent = {
      type: 'TOKEN',
      methodArn: 'arn:aws:execute-api:us-east-1:123456789012:api-id/stage/method/resourcepath',
      authorizationToken: '',
    };

    const result = await handler(event);
    expect(result.policyDocument.Statement[0].Effect).toBe('Deny');
  });

  it('should allow access when a valid token is provided', async () => {
    cognitoMock.on(GetUserCommand).resolves({
      Username: 'testuser',
    });

    const event: APIGatewayTokenAuthorizerEvent = {
      type: 'TOKEN',
      methodArn: 'arn:aws:execute-api:us-east-1:123456789012:api-id/stage/method/resourcepath',
      authorizationToken: 'Bearer validtoken',
    };

    const result = await handler(event);
    expect(result.policyDocument.Statement[0].Effect).toBe('Allow');
    expect(result.context).toHaveProperty('userId', 'testuser');
  });

  it('should deny access when Cognito returns an error', async () => {
    cognitoMock.on(GetUserCommand).rejects(new Error('Invalid token'));

    const event: APIGatewayTokenAuthorizerEvent = {
      type: 'TOKEN',
      methodArn: 'arn:aws:execute-api:us-east-1:123456789012:api-id/stage/method/resourcepath',
      authorizationToken: 'Bearer invalidtoken',
    };

    const result = await handler(event);
    expect(result.policyDocument.Statement[0].Effect).toBe('Deny');
  });
});
