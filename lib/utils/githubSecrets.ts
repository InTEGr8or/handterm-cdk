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
      throw new Error("GitHub secrets could not be retrieved from Parameter Store.");
    }

    const parsedSecrets = JSON.parse(githubSecrets);
    return {
      clientId: parsedSecrets.clientId,
      clientSecret: parsedSecrets.clientSecret,
      issuerUrl: 'https://github.com/login/oauth'
    };
  } catch (error) {
    console.error("Error fetching GitHub secrets:", error);
    throw new Error("GitHub secrets could not be retrieved from Parameter Store: " + error);
  }
}
