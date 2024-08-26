import { mockClient } from 'aws-sdk-client-mock';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { getGitHubSecrets } from '../lib/utils/githubSecrets';

const ssmMock = mockClient(SSMClient);

describe('GitHub Secrets', () => {
  beforeEach(() => {
    ssmMock.reset();
  });

  it('should retrieve GitHub secrets successfully', async () => {
    ssmMock.on(GetParameterCommand).resolves({
      Parameter: {
        Value: JSON.stringify({
          clientId: 'test-client-id',
          clientSecret: 'test-client-secret',
          issuerUrl: 'https://test-issuer.com'
        })
      }
    });

    const secrets = await getGitHubSecrets();
    expect(secrets).toEqual({
      clientId: 'test-client-id',
      clientSecret: 'test-client-secret',
      issuerUrl: 'https://test-issuer.com'
    });
  });

  it('should throw an error when secrets cannot be retrieved', async () => {
    ssmMock.on(GetParameterCommand).rejects(new Error('Parameter not found'));

    await expect(getGitHubSecrets()).rejects.toThrow('GitHub secrets could not be retrieved from Parameter Store');
  });
});
