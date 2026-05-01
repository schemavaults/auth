// generateTokensForAuthenticatedUser.ts
//
// We assume that all validation has happened prior to this being called!

import {
  SCHEMAVAULTS_AUTH_APP_DEFINITION,
  type ApiServerId,
  type AppId,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import type AuthServerJwtKeysManager from "./AuthServerJwtKeysManager";
import {
  type AccessToken,
  type RefreshToken,
  requestTokensResultSchema,
  type RequestTokensResult,
  type UserData,
  organizationIdSchema,
} from "@schemavaults/auth-common";
import type { Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import {
  type IssuedTokenGrantType,
  type NewIssuedTokenRow,
  recordIssuedTokens,
} from "@/lib/auth-db";
import captureServerException from "@/lib/captureServerException";
import generateRefreshToken from "./generateRefreshToken";
import generateAccessToken from "./generateAccessToken";

export interface ITokenIssuanceTracking {
  db: Kysely<AuthDatabase>;
  grant_type: IssuedTokenGrantType;
}

export interface IGenerateTokensForAuthenticatedUserOpts {
  auth_jwt_manager: AuthServerJwtKeysManager;
  client_app_id: AppId;
  audiences: readonly ApiServerId[];
  user: UserData;
  user_organizations: readonly string[];
  environment: SchemaVaultsAppEnvironment;
  generate_refresh: boolean;
  tracking?: ITokenIssuanceTracking;
}

function isValidUserOrganizations(user_organizations: readonly string[]): boolean {
  if (!Array.isArray(user_organizations)) {
    throw new TypeError("'user_organizations' must be an array");
  }
  return user_organizations.every((org) => typeof org === "string" && organizationIdSchema.safeParse(org).success);
}

export default async function generateTokensForAuthenticatedUser({
  auth_jwt_manager,
  client_app_id,
  audiences,
  user,
  user_organizations,
  environment,
  generate_refresh,
  tracking,
}: IGenerateTokensForAuthenticatedUserOpts): Promise<RequestTokensResult> {
  if (!isValidUserOrganizations(user_organizations)) {
    throw new Error("'user_organizations' must be an array of valid organization IDs");
  }

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
    error: false,
    client_app_id,
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

  if (tracking) {
    try {
      const rows: NewIssuedTokenRow[] = [];
      if (refresh_token && refresh_token.jti) {
        rows.push({
          jti: refresh_token.jti,
          uid: user.uid,
          token_type: "refresh",
          client_app_id,
          audience: SCHEMAVAULTS_AUTH_APP_DEFINITION.app_id,
          grant_type: tracking.grant_type,
          issued_at: refresh_token.iat,
          expires_at: refresh_token.exp,
        });
      }
      for (const [audience_id, access] of Object.entries(access_tokens)) {
        if (!access.jti) continue;
        rows.push({
          jti: access.jti,
          uid: user.uid,
          token_type: "access",
          client_app_id,
          audience: audience_id,
          grant_type: tracking.grant_type,
          issued_at: access.iat,
          expires_at: access.exp,
        });
      }
      await recordIssuedTokens(tracking.db, rows);
    } catch (e: unknown) {
      // Audit logging must never break token issuance.
      await captureServerException(tracking.db, e, {
        op_name: "generateTokensForAuthenticatedUser.recordIssuedTokens",
        uid: user.uid,
        context: { client_app_id, grant_type: tracking.grant_type },
      });
    }
  }

  return parsed_tokens_result.data;
}
