import * as AWS from 'aws-sdk';

export interface GitHubSecrets {
  clientId: string;
  clientSecret: string;
  issuerUrl: string;
}

export async function getGitHubSecrets(): Promise<GitHubSecrets> {
  const ssmClient = new AWS.SSM();
  return new Promise((resolve, reject) => {
    ssmClient.getParameter({ Name: '/github/secrets' }, (err, data) => {
      if (err) {
        reject("GitHub secrets could not be retrieved from Parameter Store: " + err);
      } else {
        const githubSecrets = data.Parameter?.Value;
        console.log("Fetched GitHub Secrets: " + githubSecrets);

        if (!githubSecrets) {
          reject("GitHub secrets could not be retrieved from Parameter Store.");
        } else {
          try {
            const parsedSecrets = JSON.parse(githubSecrets);
            resolve({
              clientId: parsedSecrets.clientId,
              clientSecret: parsedSecrets.clientSecret,
              issuerUrl: 'https://github.com/login/oauth'
            });
          } catch (error: any) {
            reject(`Failed to parse GitHub secrets JSON: ` + githubSecrets + error);
          }
        }
      }
    });
  });
}
