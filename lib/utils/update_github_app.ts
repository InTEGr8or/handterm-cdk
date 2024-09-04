import { Octokit } from "@octokit/rest";
import { getGitHubSecrets } from "./githubSecrets";
import { createAppAuth } from "@octokit/auth-app";

export async function updateGitHubAppRedirectUrl(newRedirectUrl: string): Promise<void> {
  try {
    const { clientId, clientSecret } = await getGitHubSecrets();
    const appId = process.env.GITHUB_APP_ID;
    const privateKey = process.env.GITHUB_APP_PRIVATE_KEY;

    if (!appId || !privateKey) {
      throw new Error("GitHub App ID or private key not found in environment variables");
    }

    const octokit = new Octokit({
      authStrategy: createAppAuth,
      auth: {
        appId,
        privateKey,
        clientId,
        clientSecret,
      },
    });

    const response = await octokit.apps.updateWebhookConfigForApp({
      callback_url: newRedirectUrl,
    });

    if (response.status === 200) {
      console.log(`Successfully updated GitHub App redirect URL to: ${newRedirectUrl}`);
    } else {
      console.error(`Failed to update GitHub App redirect URL. Status: ${response.status}`);
    }
  } catch (error) {
    console.error("Error updating GitHub App redirect URL:", error);
    throw error;
  }
}
