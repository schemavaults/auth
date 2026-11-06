import {
  type SchemaVaultsAppEnvironment,
  type AppId,
  appIdSchema,
  type ApiServerId,
  apiServerIdSchema,
  getTokenAudienceForApiServerId,
} from "@schemavaults/app-definitions";
import type AuthServerJwtKeysManager from "./AuthServerJwtKeysManager";
import { type I_JWT_Keys, type JwtActorClaim, JWT_Factory } from "@schemavaults/jwt";
import type { AccessToken, UserData } from "@schemavaults/auth-common";

export interface IGenerateAccessTokenOpts {
  auth_jwt_manager: AuthServerJwtKeysManager;
  client_app_id: AppId;
  audience_id: ApiServerId;
  /**
   * The `aud` claim to mint. Defaults to the token-audience form of
   * `audience_id` (the auth server URL for the auth app, the id verbatim
   * otherwise); an RFC 8707 resource URL resolved to `audience_id` is
   * passed here so the token names the resource the client asked for.
   */
  token_audience?: string;
  user: UserData;
  user_organizations: readonly string[];
  environment: SchemaVaultsAppEnvironment;
  /**
   * Space-delimited granted OIDC scopes to embed as the token's optional
   * `scope` claim. Only the OIDC surface sets this (audience
   * `oidc-userinfo`), where /api/oidc/userinfo filters claims by it.
   */
  scope?: string;
  /**
   * RFC 8693 §4.1 actor acting on behalf of `user`, embedded as the token's
   * `act` claim. Only for an audience whose API server accepts delegated
   * tokens: issueOidcTokens() checks that before minting.
   */
  actor?: JwtActorClaim;
  /**
   * Expire the token early (unix milliseconds), never later than the
   * default access-token lifetime: a delegated token is capped at its
   * subject token's expiry.
   */
  expires_at?: number;
}

export default async function generateAccessToken({
  auth_jwt_manager,
  client_app_id,
  audience_id,
  token_audience,
  user,
  user_organizations,
  environment,
  scope,
  actor,
  expires_at,
}: IGenerateAccessTokenOpts): Promise<AccessToken> {
  if (!appIdSchema.safeParse(client_app_id).success) {
    throw new TypeError("Invalid client app ID");
  }

  if (!apiServerIdSchema.safeParse(audience_id).success) {
    throw new TypeError("Invalid audience ID");
  }

  // Keysets are stored/looked-up by the stable api server id, but the token
  // `aud` claim uses the token audience form (the auth server URL for the auth
  // app; the api server id verbatim for resource servers).
  const appropriate_jwt_keys: I_JWT_Keys =
    await auth_jwt_manager.getFreshEnoughKeysetOrCreateNew(audience_id);
  const jwt_factory = new JWT_Factory({
    client_app_id,
    user,
    user_organizations,
    environment,
    jwt_keys: appropriate_jwt_keys,
  });
  const token: AccessToken = await jwt_factory.access(
    token_audience ?? getTokenAudienceForApiServerId(audience_id, environment),
    scope || actor || expires_at !== undefined
      ? {
          ...(scope ? { scope } : {}),
          ...(actor ? { actor } : {}),
          ...(expires_at !== undefined ? { expires_at } : {}),
        }
      : undefined,
  );
  return token;
}
