import "server-only";
import {
  OIDC_USERINFO_AUDIENCE_ID,
  getApiServerIdForTokenAudience,
  type AppId,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import {
  accessTokenExpiry,
  formatOidcSubClaim,
  parseAndGrantScopes,
  refreshTokenExpiry,
  type ParsedOidcScopes,
} from "@schemavaults/auth-common";
import {
  decodeJWT,
  getAudienceFromToken,
  getKeysetIdFromToken,
  type CustomJWTPayload,
  type I_JWT_Keys,
} from "@schemavaults/jwt";
import getAuthServerAppId from "@/lib/config/auth-server-app-id";
import {
  getUserTokensValidAfter,
  isTokenIatRevoked,
  isTokenRevoked,
  type ServerlessDatabase,
} from "@/lib/auth-db";
import AuthServerJwtKeysManager from "@/lib/AuthServerJwtKeysManager";
import { getAuthServerUri } from "@/lib/auth_server_uri";

/**
 * RFC 7662 §2.2 introspection response. An inactive token yields the
 * bare `{ active: false }` object — §2.2 says the server SHOULD NOT
 * include any other members, so callers cannot distinguish "expired"
 * from "revoked" from "not ours" and learn nothing about tokens they
 * were not issued.
 */
export type OidcIntrospectionResponseBody =
  | { active: false }
  | {
      active: true;
      scope: string;
      client_id: AppId;
      /** The resource owner's email; only when the `email` scope was granted. */
      username?: string;
      /** RFC 6749 §7.1 token type — present for access tokens only. */
      token_type?: "Bearer";
      exp: number;
      iat: number;
      sub: string;
      aud: string;
      iss: string;
      jti?: string;
    };

export interface IntrospectOidcTokenOptions {
  dbh: ServerlessDatabase;
  /** The `token` parameter value presented for introspection. */
  token: string;
  /** The authenticated confidential client asking about the token. */
  client_app_id: AppId;
  environment: SchemaVaultsAppEnvironment;
}

/**
 * Evaluates the state of a token issued by the OIDC surface (RFC 7662
 * §2). Two token kinds are recognized, disambiguated by the audience
 * named in the token header:
 *
 *  - access tokens: JWEs minted for the reserved `oidc-userinfo`
 *    audience (opaque to the RP; redeemable at /api/oidc/userinfo)
 *  - refresh tokens: JWEs minted for the auth server's own audience
 *
 * Anything else — malformed input, tokens for other resource-API
 * audiences, expired or signature-invalid tokens — reports as inactive
 * rather than erroring, per §2.2.
 *
 * Beyond cryptographic validity (decodeJWT enforces decryption,
 * signature, issuer, audience, environment, and max token age), a token
 * is only reported active when:
 *
 *  - it was issued to the introspecting client (`app` claim) — a
 *    confidential client can never probe another client's tokens
 *  - it was issued by the OIDC surface (granted scope includes
 *    `openid`; custom-surface tokens carry no scope claim)
 *  - its jti has not been revoked (logout / rotation) and it predates
 *    no per-user tokens_valid_after watermark (password reset), and the
 *    account is not disabled
 */
export async function introspectOidcToken({
  dbh,
  token,
  client_app_id,
  environment,
}: IntrospectOidcTokenOptions): Promise<OidcIntrospectionResponseBody> {
  const auth_app_id = getAuthServerAppId();

  let decoded: CustomJWTPayload;
  let token_kind: "access" | "refresh";
  try {
    const token_audience: string = getAudienceFromToken(token, environment);
    const keyset_id: string = getKeysetIdFromToken(token);
    const keysManager = new AuthServerJwtKeysManager(dbh.db);

    if (token_audience === OIDC_USERINFO_AUDIENCE_ID) {
      token_kind = "access";
      const keyset: I_JWT_Keys = await keysManager.getKeyset(
        OIDC_USERINFO_AUDIENCE_ID,
        keyset_id,
      );
      decoded = await decodeJWT({
        type: "access",
        jwt: token,
        audience: OIDC_USERINFO_AUDIENCE_ID,
        jwt_keys: keyset,
        env: environment,
      });
    } else if (
      getApiServerIdForTokenAudience(token_audience, environment) ===
      auth_app_id
    ) {
      token_kind = "refresh";
      const keyset: I_JWT_Keys = await keysManager.getKeyset(
        auth_app_id,
        keyset_id,
      );
      decoded = await decodeJWT({
        type: "refresh",
        jwt: token,
        jwt_keys: keyset,
        env: environment,
      });
    } else {
      // Tokens minted for other resource-API audiences are verified by
      // those resource servers themselves and are not introspectable
      // here.
      return { active: false };
    }
  } catch {
    return { active: false };
  }

  if (decoded.app !== client_app_id) {
    return { active: false };
  }

  const scopes: ParsedOidcScopes = parseAndGrantScopes(decoded.scope);
  if (!scopes.hasOpenid) {
    return { active: false };
  }

  if (decoded.disabled) {
    return { active: false };
  }

  // Unlike the refresh grant, introspection applies NO rotation-reuse
  // grace window: a rotated-away refresh token reports inactive
  // immediately — the grace exists so benign concurrent refreshes
  // succeed, not to make superseded tokens look alive.
  if (decoded.jti && (await isTokenRevoked(dbh.db, decoded.jti))) {
    return { active: false };
  }
  const tokens_valid_after: number = await getUserTokensValidAfter(
    dbh.db,
    decoded.uid,
  );
  if (isTokenIatRevoked(decoded.iat, tokens_valid_after)) {
    return { active: false };
  }

  // `exp` is reconstructed as iat + the per-type validity duration —
  // exactly the window decodeJWT itself enforces via maxTokenAge.
  const validity_seconds: number =
    token_kind === "access" ? accessTokenExpiry : refreshTokenExpiry;

  return {
    active: true,
    scope: scopes.granted.join(" "),
    client_id: decoded.app,
    exp: decoded.iat + validity_seconds,
    iat: decoded.iat,
    // OIDC-facing `<auth_server_app_id>|<uid>` form, matching the
    // id_token and userinfo `sub` for the same user.
    sub: formatOidcSubClaim(auth_app_id, decoded.sub),
    aud: decoded.aud,
    iss: getAuthServerUri(environment),
    ...(token_kind === "access" ? { token_type: "Bearer" as const } : {}),
    ...(decoded.jti ? { jti: decoded.jti } : {}),
    ...(scopes.granted.includes("email") ? { username: decoded.email } : {}),
  };
}

export default introspectOidcToken;
