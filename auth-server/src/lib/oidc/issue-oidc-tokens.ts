import "server-only";
import {
  OIDC_USERINFO_AUDIENCE_ID,
  type AppId,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import {
  accessTokenExpiry,
  type AccessToken,
  type RefreshToken,
  type RequestTokensResult,
  type UserData,
} from "@schemavaults/auth-common";
import { generateIdToken, type I_JWT_Keys } from "@schemavaults/jwt";
import {
  AuthServerJwtKeysManager,
  generateTokensForAuthenticatedUser,
} from "@/lib/AuthServerJwtKeysManager";
import { OrganizationsRegistry, type ServerlessDatabase } from "@/lib/auth-db";
import type { IssuedTokenGrantType } from "@/lib/auth-db";

export interface IssueOidcTokensOptions {
  dbh: ServerlessDatabase;
  user: UserData;
  client_app_id: AppId;
  /** Granted scopes, space-delimited (always includes "openid"). */
  scope: string;
  /** RP nonce to echo into the id_token; null when absent / on refresh. */
  nonce: string | null;
  grant_type: IssuedTokenGrantType;
  environment: SchemaVaultsAppEnvironment;
  /**
   * id_token issuance: true on the authorization_code grant; false on
   * refresh (permitted by OIDC Core §12.2 — refresh responses MAY omit
   * the id_token).
   */
  include_id_token: boolean;
  debug?: boolean;
}

/**
 * RFC 6749 §5.1 / OIDC Core §3.1.3.3 token response body. The refresh
 * token is INLINED in the JSON (never cookie-ized like
 * returnGeneratedTokensToUser does for the custom surface) because OIDC
 * RPs are third-party public clients on other origins.
 */
export interface OidcTokenResponseBody {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  refresh_token: string;
  scope: string;
  id_token?: string;
}

/**
 * Issues the OIDC token set for an authenticated user: a JWE access
 * token minted for the reserved `oidc-userinfo` audience (opaque to the
 * RP; redeemable only at /api/oidc/userinfo), a refresh token carrying
 * the granted scope, and (on the code grant) an RS256-signed id_token
 * verifiable against the public /api/oidc/jwks.
 *
 * All authorization checks (code consumption, disabled account, app
 * authorization) are the caller's responsibility.
 */
export async function issueOidcTokens({
  dbh,
  user,
  client_app_id,
  scope,
  nonce,
  grant_type,
  environment,
  include_id_token,
  debug = false,
}: IssueOidcTokensOptions): Promise<OidcTokenResponseBody> {
  const orgRegistry = new OrganizationsRegistry(dbh.db, debug);
  const user_organizations: readonly string[] =
    await orgRegistry.listUserOrganizationMembershipIds(
      user.uid,
      user.admin ?? false,
    );

  const jwt_keys_manager = new AuthServerJwtKeysManager(dbh.db);

  const tokenGenerationResult: RequestTokensResult =
    await generateTokensForAuthenticatedUser({
      user,
      client_app_id,
      user_organizations,
      environment,
      audiences: [OIDC_USERINFO_AUDIENCE_ID],
      generate_refresh: true,
      auth_jwt_manager: jwt_keys_manager,
      scope,
      tracking: {
        db: dbh.db,
        grant_type,
      },
    });
  if (!tokenGenerationResult.success || tokenGenerationResult.error) {
    throw new Error(tokenGenerationResult.message);
  }

  const access_token: AccessToken | "AS_HTTP_ONLY_COOKIE" | undefined =
    tokenGenerationResult.tokens?.access?.[OIDC_USERINFO_AUDIENCE_ID];
  if (!access_token || typeof access_token === "string") {
    throw new Error("OIDC access token missing from token generation result!");
  }
  const refresh_token: RefreshToken | "AS_HTTP_ONLY_COOKIE" | undefined =
    tokenGenerationResult.tokens?.refresh;
  if (!refresh_token || typeof refresh_token === "string") {
    throw new Error("OIDC refresh token missing from token generation result!");
  }

  const body: OidcTokenResponseBody = {
    access_token: access_token.token,
    token_type: "Bearer",
    expires_in: accessTokenExpiry,
    refresh_token: refresh_token.token,
    scope,
  };

  if (include_id_token) {
    const oidc_keyset: I_JWT_Keys =
      await jwt_keys_manager.getFreshEnoughKeysetOrCreateNew(
        OIDC_USERINFO_AUDIENCE_ID,
      );
    // Echo the RP-supplied nonce into the id_token claim (OIDC Core
    // §2). `nonce` is optional in the authorization-code flow: when the
    // RP omitted it the code row carries null and no claim is emitted —
    // strict RP libraries reject an id_token bearing a nonce claim their
    // request never sent.
    const id_token_nonce: string | null = nonce ?? null;
    const { id_token } = await generateIdToken({
      user,
      client_id: client_app_id,
      nonce: id_token_nonce,
      scopes: scope.split(" "),
      jwt_keys: oidc_keyset,
      environment,
    });
    body.id_token = id_token;
  }

  return body;
}

export default issueOidcTokens;
