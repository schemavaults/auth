// generateTokensForAuthenticatedUser.ts
//
// We assume that all validation has happened prior to this being called!

import type {
  ApiServerId,
  AppId,
  SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import type AuthServerJwtKeysManager from "./AuthServerJwtKeysManager";
import {
  type AccessToken,
  type RefreshToken,
  requestTokensResultSchema,
  type RequestTokensResult,
  type UserData,
} from "@schemavaults/auth-common";
import generateRefreshToken from "./generateRefreshToken";
import generateAccessToken from "./generateAccessToken";

export interface IGenerateTokensForAuthenticatedUserOpts {
  auth_jwt_manager: AuthServerJwtKeysManager;
  client_app_id: AppId;
  audiences: readonly ApiServerId[];
  user: UserData;
  user_organizations: readonly string[];
  environment: SchemaVaultsAppEnvironment;
  generate_refresh: boolean;
}

export default async function generateTokensForAuthenticatedUser({
  auth_jwt_manager,
  client_app_id,
  audiences,
  user,
  user_organizations,
  environment,
  generate_refresh,
}: IGenerateTokensForAuthenticatedUserOpts): Promise<RequestTokensResult> {
  let refresh_token: RefreshToken | undefined = undefined;
  if (generate_refresh) {
    refresh_token = await generateRefreshToken({
      client_app_id,
      auth_jwt_manager,
      user,
      environment,
      user_organizations,
    });
  }

  const access_tokens: Record<string, AccessToken> = {};
  for (const audience_id of audiences) {
    access_tokens[audience_id] = await generateAccessToken({
      client_app_id,
      auth_jwt_manager,
      user,
      audience_id,
      environment,
      user_organizations,
    });
  }

  const parsed_tokens_result = requestTokensResultSchema.safeParse({
    message: `Generated token(s) for user '${user.uid}'`,
    success: true,
    userData: {
      ...user,
    },
    userOrgs: [...user_organizations],
    tokens: {
      refresh: refresh_token ?? undefined,
      access: access_tokens ?? undefined,
    },
  } satisfies RequestTokensResult);

  if (!parsed_tokens_result.success) {
    console.error(parsed_tokens_result.error);
    throw new Error("Failed to validate output of token generation");
  }

  return parsed_tokens_result.data;
}
