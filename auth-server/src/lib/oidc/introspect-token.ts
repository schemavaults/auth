import "server-only";
import {
  OIDC_USERINFO_AUDIENCE_ID,
  getApiServerIdForTokenAudience,
  type ApiServerId,
  type AppId,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import {
  accessTokenExpiry,
  formatOidcSubClaim,
  isResourceUrlAudience,
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
import isAppAuthorizedForUser from "@/lib/auth-db/apps/authorized-apps-registry/is-app-authorized-for-user";
import AuthServerJwtKeysManager from "@/lib/AuthServerJwtKeysManager";
import { getAuthServerUri } from "@/lib/auth_server_uri";
import { isClientAppPermittedForApiServer } from "@/lib/validate-audience";

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
      /**
       * Space-delimited granted scopes; absent when the token was minted
       * for a plain OAuth 2.1 grant (nothing granted) — RFC 7662 §2.2
       * makes `scope` OPTIONAL.
       */
      scope?: string;
      client_id: AppId;
      /** The resource owner's email; only when the `email` scope was granted. */
      username?: string;
      /** RFC 6749 §7.1 token type — present for access tokens only. */
      token_type?: "Bearer";
      exp: number;
      iat: number;
      /** OIDC subject `<auth_server_app_id>|<uid>`. */
      sub: string;
      /** The platform user id (the uid inside `sub`). */
      uid: string;
      aud: string;
      iss: string;
      jti?: string;
    };

/**
 * Who is introspecting, as established by client authentication:
 *  - a confidential client app (client secret), which may introspect the
 *    OIDC-surface tokens issued to it;
 *  - an API server (`private_key_jwt` with its JWKS access key), which may
 *    introspect the access tokens minted for it.
 */
export type OidcIntrospectionCaller =
  | { kind: "client_app"; client_app_id: AppId }
  | { kind: "api_server"; api_server_id: ApiServerId };

export interface IntrospectOidcTokenOptions {
  dbh: ServerlessDatabase;
  /** The `token` parameter value presented for introspection. */
  token: string;
  /** The authenticated caller asking about the token. */
  caller: OidcIntrospectionCaller;
  environment: SchemaVaultsAppEnvironment;
}

const INACTIVE = { active: false } as const;

interface DecodedIntrospectableToken {
  payload: CustomJWTPayload;
  kind: "access" | "refresh";
}

interface DecodeIntrospectableTokenOptions {
  token: string;
  /** The audience named in the token header (not yet verified). */
  token_audience: string;
  keyset_id: string;
  keysManager: AuthServerJwtKeysManager;
  environment: SchemaVaultsAppEnvironment;
}

/**
 * A client app introspects the tokens of the OIDC surface: access tokens
 * minted for the reserved `oidc-userinfo` audience (opaque to the RP;
 * redeemable at /api/oidc/userinfo) and refresh tokens minted for the auth
 * server's own audience. Returns null for any other audience.
 */
async function decodeClientAppIntrospectableToken({
  token,
  token_audience,
  keyset_id,
  keysManager,
  environment,
}: DecodeIntrospectableTokenOptions): Promise<DecodedIntrospectableToken | null> {
  const auth_app_id = getAuthServerAppId();
  if (token_audience === OIDC_USERINFO_AUDIENCE_ID) {
    const keyset: I_JWT_Keys = await keysManager.getKeyset(
      OIDC_USERINFO_AUDIENCE_ID,
      keyset_id,
    );
    return {
      kind: "access",
      payload: await decodeJWT({
        type: "access",
        jwt: token,
        audience: OIDC_USERINFO_AUDIENCE_ID,
        jwt_keys: keyset,
        env: environment,
      }),
    };
  }
  if (getApiServerIdForTokenAudience(token_audience, environment) === auth_app_id) {
    const keyset: I_JWT_Keys = await keysManager.getKeyset(
      auth_app_id,
      keyset_id,
    );
    return {
      kind: "refresh",
      payload: await decodeJWT({
        type: "refresh",
        jwt: token,
        jwt_keys: keyset,
        env: environment,
      }),
    };
  }
  // Tokens minted for resource-API audiences are introspected by those API
  // servers, not by the client they were issued to.
  return null;
}

/**
 * An API server introspects the access tokens minted for it: its id as the
 * audience, or an RFC 8707 resource URL that resolved to it at issuance.
 * Either way the token is encrypted with the API server's own keyset, and
 * keysets are looked up by (audience, keyset id), so a token that decrypts
 * with the caller's keyset was minted for the caller — another API server's
 * tokens fail here and report inactive. The auth server's own tokens
 * (refresh tokens, `oidc-userinfo` access tokens) never belong to an API
 * server. Returns null for those.
 */
async function decodeApiServerIntrospectableToken(
  api_server_id: ApiServerId,
  {
    token,
    token_audience,
    keyset_id,
    keysManager,
    environment,
  }: DecodeIntrospectableTokenOptions,
): Promise<DecodedIntrospectableToken | null> {
  if (
    token_audience === OIDC_USERINFO_AUDIENCE_ID ||
    getApiServerIdForTokenAudience(token_audience, environment) ===
      getAuthServerAppId()
  ) {
    return null;
  }
  if (
    token_audience !== api_server_id &&
    !isResourceUrlAudience(token_audience, environment)
  ) {
    return null;
  }
  const keyset: I_JWT_Keys = await keysManager.getKeyset(
    api_server_id,
    keyset_id,
  );
  return {
    kind: "access",
    payload: await decodeJWT({
      type: "access",
      jwt: token,
      audience: token_audience,
      jwt_keys: keyset,
      env: environment,
    }),
  };
}

/**
 * Evaluates the state of a token issued by this server (RFC 7662 §2) for
 * an authenticated caller. Which tokens a caller may introspect depends on
 * who it is (see {@link OidcIntrospectionCaller}): a client app, the OIDC
 * surface's tokens issued to it; an API server, the access tokens minted
 * for it. Anything else — malformed input, tokens the caller may not see,
 * expired or signature-invalid tokens — reports as inactive rather than
 * erroring, per §2.2.
 *
 * Beyond cryptographic validity (decodeJWT enforces decryption,
 * signature, issuer, audience, environment, and max token age), a token
 * is only reported active when:
 *
 *  - a client app caller is the client the token was issued to (`app`
 *    claim) — a confidential client can never probe another client's tokens
 *  - its jti has not been revoked (logout / rotation) and it predates
 *    no per-user tokens_valid_after watermark (password reset, disabled
 *    account), and the
 *    account is not disabled
 *  - the user still authorizes the client app the token was issued to:
 *    §2.2 defines `active` as "has not been revoked by the resource owner",
 *    and the refresh grant refuses a de-authorized app's tokens too
 *  - for an API server caller, the client app is still allowed to obtain
 *    tokens for that API server (the token endpoints' app-to-API connection
 *    rule), so disconnecting the app deactivates its tokens
 */
export async function introspectOidcToken({
  dbh,
  token,
  caller,
  environment,
}: IntrospectOidcTokenOptions): Promise<OidcIntrospectionResponseBody> {
  const auth_app_id = getAuthServerAppId();

  let decoded: CustomJWTPayload;
  let token_kind: "access" | "refresh";
  try {
    const options: DecodeIntrospectableTokenOptions = {
      token,
      token_audience: getAudienceFromToken(token, environment),
      keyset_id: getKeysetIdFromToken(token),
      keysManager: new AuthServerJwtKeysManager(dbh.db),
      environment,
    };
    const result: DecodedIntrospectableToken | null =
      caller.kind === "client_app"
        ? await decodeClientAppIntrospectableToken(options)
        : await decodeApiServerIntrospectableToken(
            caller.api_server_id,
            options,
          );
    if (!result) {
      return INACTIVE;
    }
    decoded = result.payload;
    token_kind = result.kind;
  } catch {
    return INACTIVE;
  }

  if (caller.kind === "client_app" && decoded.app !== caller.client_app_id) {
    return INACTIVE;
  }

  // The granted scope is reported as-is (RFC 7662 §2.2 `scope` is
  // OPTIONAL); a token minted for a plain OAuth 2.1 grant carries none
  // and is every bit as active as an OpenID one.
  const scopes: ParsedOidcScopes = parseAndGrantScopes(decoded.scope);

  if (decoded.disabled) {
    return INACTIVE;
  }

  // Unlike the refresh grant, introspection applies NO rotation-reuse
  // grace window: a rotated-away refresh token reports inactive
  // immediately — the grace exists so benign concurrent refreshes
  // succeed, not to make superseded tokens look alive.
  if (decoded.jti && (await isTokenRevoked(dbh.db, decoded.jti))) {
    return INACTIVE;
  }
  const tokens_valid_after: number = await getUserTokensValidAfter(
    dbh.db,
    decoded.uid,
  );
  if (isTokenIatRevoked(decoded.iat, tokens_valid_after)) {
    return INACTIVE;
  }
  // Revoking the app's authorization (DELETE /api/apps/{app_id}/authorize)
  // also revokes its tracked tokens by jti, but issued-token tracking is
  // best-effort, so the consent itself is checked here as well. A service
  // account's authorization row is created with it, so client_credentials
  // tokens pass.
  if (!(await isAppAuthorizedForUser(dbh.db, decoded.uid, decoded.app))) {
    return INACTIVE;
  }
  if (
    caller.kind === "api_server" &&
    !(await isClientAppPermittedForApiServer(
      decoded.app,
      caller.api_server_id,
      dbh,
    ))
  ) {
    return INACTIVE;
  }

  // `exp` is reconstructed as iat + the per-type validity duration —
  // exactly the window decodeJWT itself enforces via maxTokenAge.
  const validity_seconds: number =
    token_kind === "access" ? accessTokenExpiry : refreshTokenExpiry;

  return {
    active: true,
    ...(scopes.granted.length > 0
      ? { scope: scopes.granted.join(" ") }
      : {}),
    client_id: decoded.app,
    exp: decoded.iat + validity_seconds,
    iat: decoded.iat,
    // OIDC-facing `<auth_server_app_id>|<uid>` form, matching the
    // id_token and userinfo `sub` for the same user.
    sub: formatOidcSubClaim(auth_app_id, decoded.uid),
    uid: decoded.uid,
    aud: decoded.aud,
    iss: getAuthServerUri(environment),
    ...(token_kind === "access" ? { token_type: "Bearer" as const } : {}),
    ...(decoded.jti ? { jti: decoded.jti } : {}),
    ...(scopes.granted.includes("email") ? { username: decoded.email } : {}),
  };
}

export default introspectOidcToken;
