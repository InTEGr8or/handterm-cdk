import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";

export interface GitHubSecrets {
  clientId: string;
  clientSecret: string;
  issuerUrl: string;
}

export async function getGitHubSecrets(): Promise<GitHubSecrets> {
  const ssmClient = new SSMClient();
  try {
    const command = new GetParameterCommand({ Name: '/github/secrets' });
    const response = await ssmClient.send(command);
    const githubSecrets = response.Parameter?.Value;
    console.log("Fetched GitHub Secrets: " + githubSecrets);

    if (!githubSecrets) {
      console.warn("GitHub secrets not found in Parameter Store. Using default values for testing.");
      return {
        clientId: 'default-client-id',
        clientSecret: 'default-client-secret',
        issuerUrl: 'https://github.com/login/oauth'
      };
    }

    const parsedSecrets = JSON.parse(githubSecrets);
    return {
      clientId: parsedSecrets.clientId,
      clientSecret: parsedSecrets.clientSecret,
      issuerUrl: 'https://github.com/login/oauth'
    };
  } catch (error) {
    console.error("Error fetching GitHub secrets:", error);
    console.warn("Using default values for testing.");
    return {
      clientId: 'default-client-id',
      clientSecret: 'default-client-secret',
      issuerUrl: 'https://github.com/login/oauth'
    };
  }
}
