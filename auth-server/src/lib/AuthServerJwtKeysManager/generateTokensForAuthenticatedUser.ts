// generateTokensForAuthenticatedUser.ts
//
// We assume that all validation has happened prior to this being called!

import {
  apiServerIdSchema,
  getApiServerIdForTokenAudience,
  getTokenAudienceForApiServerId,
  type ApiServerId,
  type AppId,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import getAuthServerAppId from "@/lib/config/auth-server-app-id";
import type AuthServerJwtKeysManager from "./AuthServerJwtKeysManager";
import { z } from "zod";
import {
  type AccessToken,
  type RefreshToken,
  createRequestTokensResultSchema,
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
  revokeToken,
} from "@/lib/auth-db";
import captureServerException from "@/lib/captureServerException";
import generateRefreshToken from "./generateRefreshToken";
import generateAccessToken from "./generateAccessToken";

export interface ITokenIssuanceTracking {
  db: Kysely<AuthDatabase>;
  grant_type: IssuedTokenGrantType;
  /**
   * Refresh token rotation: revoke this (presented) refresh token in the
   * SAME transaction that records the replacement tokens' issuance rows,
   * so the rotation commits atomically. Unlike plain issuance tracking,
   * a failure here is fatal to the grant — returning replacement tokens
   * without the revocation row would leave the rotated-away token live.
   */
  revoke_rotated_refresh_token?: {
    jti: string;
    uid: string;
    expires_at: number;
  };
}

export interface IGenerateTokensForAuthenticatedUserOpts {
  auth_jwt_manager: AuthServerJwtKeysManager;
  client_app_id: AppId;
  /** Requested audiences in token-audience form (auth server URL, api server id, or resource URL) */
  audiences: readonly string[];
  /**
   * For audiences that are RFC 8707 resource URLs: the API server id
   * (keyset owner) each such audience was resolved to. The token's `aud`
   * carries the URL verbatim; the keyset comes from the mapped id. An
   * audience that is neither statically mappable nor listed here is
   * rejected.
   */
  audience_api_server_ids?: Readonly<Record<string, ApiServerId>>;
  user: UserData;
  user_organizations: readonly string[];
  environment: SchemaVaultsAppEnvironment;
  generate_refresh: boolean;
  tracking?: ITokenIssuanceTracking;
  /**
   * Space-delimited granted OIDC scopes embedded in the generated ACCESS
   * tokens' optional `scope` claim (refresh tokens never carry it).
   * Set only by the OIDC surface.
   */
  scope?: string;
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
  scope,
  audience_api_server_ids,
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
      scope,
    });
  }

  // Requested audiences arrive in token-audience form (the auth server URL,
  // or an api server id verbatim). Keyset lookups need the stable api server
  // id, while the response record is keyed by the canonical token audience —
  // that's the key clients use to look up the token they requested.
  const access_tokens: Record<string, AccessToken> = {};
  // Keyset owner per minted token audience (needed again below when the
  // issuance records are written).
  const keyset_api_server_ids: Record<string, ApiServerId> = {};
  for (const audience of audiences) {
    // A resource URL audience carries no keyset id of its own: the caller
    // resolved it to an API server and passes the mapping; the `aud`
    // claim keeps the URL verbatim.
    const mapped_api_server_id: ApiServerId | undefined =
      audience_api_server_ids?.[audience];
    const audience_id: ApiServerId =
      mapped_api_server_id ?? getApiServerIdForTokenAudience(audience, environment);
    if (!apiServerIdSchema.safeParse(audience_id).success) {
      throw new TypeError(
        `Token audience '${audience}' does not map to an API server id; resolve resource URLs to an API server before minting tokens`,
      );
    }
    const token_audience: string = mapped_api_server_id
      ? audience
      : getTokenAudienceForApiServerId(audience_id, environment);
    keyset_api_server_ids[token_audience] = audience_id;
    access_tokens[token_audience] = await generateAccessToken({
      client_app_id,
      auth_jwt_manager,
      user,
      audience_id,
      token_audience,
      environment,
      user_organizations,
      scope,
    });
  }

  const parsed_tokens_result = createRequestTokensResultSchema(
    z,
    environment,
  ).safeParse({
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
    const rows: NewIssuedTokenRow[] = [];
    if (refresh_token && refresh_token.jti) {
      rows.push({
        jti: refresh_token.jti,
        uid: user.uid,
        token_type: "refresh",
        client_app_id,
        audience: getAuthServerAppId(),
        grant_type: tracking.grant_type,
        issued_at: refresh_token.iat,
        expires_at: refresh_token.exp,
        refresh_jti: null,
      });
    }
    for (const [token_audience, access] of Object.entries(access_tokens)) {
      if (!access.jti) continue;
      rows.push({
        jti: access.jti,
        uid: user.uid,
        token_type: "access",
        client_app_id,
        // issued-token rows are tracked by the stable api server id (a
        // resource URL audience maps to the API server it resolved to)
        audience:
          keyset_api_server_ids[token_audience] ??
          getApiServerIdForTokenAudience(token_audience, environment),
        grant_type: tracking.grant_type,
        issued_at: access.iat,
        expires_at: access.exp,
        // Link to the refresh token minted in this same grant so logging
        // that session out revokes its access tokens too.
        refresh_jti: refresh_token?.jti ?? null,
      });
    }

    const rotation = tracking.revoke_rotated_refresh_token;
    if (rotation) {
      // Refresh token rotation: the presented token's revocation and the
      // replacement tokens' issuance rows commit atomically — either the
      // rotation fully lands, or neither side does. Deliberately NOT
      // swallowed like the audit-only branch below: a thrown error here
      // fails the grant closed, because returning the replacement tokens
      // without the revocation row would leave the rotated-away token
      // redeemable.
      await tracking.db.transaction().execute(async (trx) => {
        await recordIssuedTokens(trx, rows);
        await revokeToken(
          trx,
          rotation.jti,
          rotation.uid,
          rotation.expires_at,
          "rotation",
        );
      });
    } else {
      try {
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
  }

  return parsed_tokens_result.data;
}
