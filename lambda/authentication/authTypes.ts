// cdk/lambda/authentication/authTypes.ts
import { AttributeType } from "@aws-sdk/client-cognito-identity-provider";

export interface APIGatewayProxyEvent {
  body: string | null;
}

export interface APIGatewayProxyResult {
  statusCode: number;
  body: string;
  headers?: Record<string, string | string[]>;
}

export interface AuthenticationResult {
  IdToken?: string;
  AccessToken?: string;
  RefreshToken?: string;
}

export interface UserAttribute extends AttributeType {}

export const CognitoAttribute = {
  GH_TOKEN: 'custom:gh_token',
  GH_REFRESH_TOKEN: 'custom:gh_refresh_token',
  GH_TOKEN_EXPIRES: 'custom:gh_token_expires',
  GH_REFRESH_EXPIRES: 'custom:gh_refresh_expires',
  GH_USERNAME: 'custom:gh_username',
  GH_ID: 'custom:gh_id',
};

export const GitHubToCognitoMap = {
  access_token: CognitoAttribute.GH_TOKEN,
  refresh_token: CognitoAttribute.GH_REFRESH_TOKEN,
  expires_in: CognitoAttribute.GH_TOKEN_EXPIRES,
  refresh_token_expires_in: CognitoAttribute.GH_REFRESH_EXPIRES,
  login: CognitoAttribute.GH_USERNAME,
  id: CognitoAttribute.GH_ID,
};

// Remove the default export that was causing type errors
