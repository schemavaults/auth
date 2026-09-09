import "server-only";
import type { NextResponse } from "next/server";
import {
  getApiServerIdForTokenAudience,
  type AppId,
} from "@schemavaults/app-definitions";
import {
  oidcScopeSchema,
  parseAndGrantScopes,
  refreshTokenExpiry,
  type UserData,
} from "@schemavaults/auth-common";
import {
  decodeJWT,
  getAudienceFromToken,
  getKeysetIdFromToken,
  type CustomJWTPayload,
  type I_JWT_Keys,
} from "@schemavaults/jwt";
import { RefreshTokenCookieName } from "@schemavaults/auth-server-sdk/RefreshTokenCookieNames";
import getAuthServerAppId from "@/lib/config/auth-server-app-id";
import {
  UserRegistry,
  getUserTokensValidAfter,
  isTokenIatRevoked,
  isTokenRevoked,
  loadUserData,
  REFRESH_TOKEN_ROTATION_REUSE_GRACE_MS,
} from "@/lib/auth-db";
import isAppAuthorizedForUser from "@/lib/auth-db/apps/authorized-apps-registry/is-app-authorized-for-user";
import AuthServerJwtKeysManager from "@/lib/AuthServerJwtKeysManager";
import { oidcTokenErrorResponse } from "@/lib/oidc/oidc-errors";
import issueOidcTokens from "@/lib/oidc/issue-oidc-tokens";
import {
  parseOidcTokenResourceParam,
  validateOidcTokenResource,
} from "@/lib/oidc/token-request-extensions";
import type {
  OidcGrantContext,
  OidcGrantOutcome,
  OidcTokenFormParam,
} from "./token-response";

/**
 * Locates the refresh token presented with the grant: the standard
 * `refresh_token` form parameter (RFC 6749 §6), or — for SDK clients
 * that asked for HTTP-only-cookie delivery on a previous grant — the
 * platform's per-client-app refresh-token cookie. The explicit form
 * parameter wins when both are present.
 */
export function extractPresentedRefreshToken(
  param: OidcTokenFormParam,
  cookies: OidcGrantContext["request"]["cookies"],
  client_app_id: AppId,
): string | null {
  const from_form: string | null = param("refresh_token");
  if (from_form) {
    return from_form;
  }
  const from_cookie: string | undefined = cookies.get(
    RefreshTokenCookieName(client_app_id),
  )?.value;
  return typeof from_cookie === "string" && from_cookie.length > 0
    ? from_cookie
    : null;
}

/**
 * grant_type=refresh_token (RFC 6749 §6 / OIDC Core §12): redeems a
 * refresh token for a fresh token set (no id_token — OIDC Core §12.2
 * permits omitting it). The token's granted scope (possibly none, for a
 * plain OAuth 2.1 grant) carries forward on rotation. Called from
 * route.ts after
 * grant_type/client_id validation and client authentication; the
 * shared try/catch there owns exception capture, and route.ts delivers
 * the issued tokens.
 */
export async function handleOidcRefreshTokenGrant({
  dbh,
  request,
  form,
  param,
  client_app_id,
  environment,
  debug,
}: OidcGrantContext): Promise<OidcGrantOutcome> {
  const fail = (response: NextResponse): OidcGrantOutcome => ({
    ok: false,
    response,
  });

  const refresh_token: string | null = extractPresentedRefreshToken(
    param,
    request.cookies,
    client_app_id,
  );
  if (!refresh_token) {
    return fail(
      oidcTokenErrorResponse(
        "invalid_request",
        "Missing 'refresh_token' parameter.",
      ),
    );
  }

  const parsed_resource = parseOidcTokenResourceParam(form, environment);
  if (!parsed_resource.ok) {
    return fail(
      oidcTokenErrorResponse(
        parsed_resource.error.error,
        parsed_resource.error.error_description,
      ),
    );
  }
  const resource: string | null = parsed_resource.resource;

  // Locate + decode: keyset id and audience come from the token header;
  // refresh tokens are always signed with the auth server's own keyset.
  const auth_app_id = getAuthServerAppId();
  let decoded: CustomJWTPayload;
  try {
    const keyset_id: string = getKeysetIdFromToken(refresh_token);
    const token_audience: string = getAudienceFromToken(
      refresh_token,
      environment,
    );
    if (
      getApiServerIdForTokenAudience(token_audience, environment) !==
      auth_app_id
    ) {
      return fail(
        oidcTokenErrorResponse(
          "invalid_grant",
          "Invalid refresh token audience.",
        ),
      );
    }
    const keyset: I_JWT_Keys = await new AuthServerJwtKeysManager(
      dbh.db,
    ).getKeyset(auth_app_id, keyset_id);
    decoded = await decodeJWT({
      type: "refresh",
      jwt: refresh_token,
      jwt_keys: keyset,
      env: environment,
    });
  } catch {
    return fail(
      oidcTokenErrorResponse(
        "invalid_grant",
        "Invalid or expired refresh token.",
      ),
    );
  }

  // The refresh token must have been issued to this client...
  if (decoded.app !== client_app_id) {
    return fail(
      oidcTokenErrorResponse(
        "invalid_grant",
        "Refresh token was not issued to this client.",
      ),
    );
  }
  // ...and its granted scope carries forward. A token with no `scope`
  // claim was minted for a plain OAuth 2.1 grant (nothing granted); it
  // rotates like any other and its replacements carry no scope either.
  const original_scopes = parseAndGrantScopes(decoded.scope);

  // Revocation checks: explicit jti revocation (logout) plus the
  // per-user tokens_valid_after watermark (password reset). Rotation
  // revocations get a short reuse grace window so benign concurrent
  // refreshes don't invalidate the session; all other revocations are
  // immediate.
  if (
    decoded.jti &&
    (await isTokenRevoked(dbh.db, decoded.jti, {
      rotationReuseGraceMs: REFRESH_TOKEN_ROTATION_REUSE_GRACE_MS,
    }))
  ) {
    return fail(
      oidcTokenErrorResponse(
        "invalid_grant",
        "Refresh token has been revoked.",
      ),
    );
  }
  const tokens_valid_after: number = await getUserTokensValidAfter(
    dbh.db,
    decoded.uid,
  );
  if (isTokenIatRevoked(decoded.iat, tokens_valid_after)) {
    return fail(
      oidcTokenErrorResponse(
        "invalid_grant",
        "Refresh token has been revoked.",
      ),
    );
  }

  const userRegistry = new UserRegistry(dbh.db, debug);
  const user: UserData = await loadUserData(decoded.uid, userRegistry);
  if (user.disabled) {
    return fail(
      oidcTokenErrorResponse("invalid_grant", "Account is disabled."),
    );
  }
  const appAuthorized: boolean = await isAppAuthorizedForUser(
    dbh.db,
    user.uid,
    client_app_id,
    debug,
  );
  if (!appAuthorized) {
    return fail(
      oidcTokenErrorResponse(
        "invalid_grant",
        "The user has not authorized this client application.",
      ),
    );
  }

  if (resource !== null) {
    const resourceError = await validateOidcTokenResource({
      uid: user.uid,
      client_app_id,
      resource,
      dbh,
      environment,
      debug,
    });
    if (resourceError) {
      return fail(
        oidcTokenErrorResponse(
          resourceError.error,
          resourceError.error_description,
        ),
      );
    }
  }

  // RFC 6749 §6: a scope re-request must be a subset of the original
  // grant; absent means "same as originally granted". Narrowing away
  // `openid` is allowed (the result is a plain OAuth token set), but a
  // malformed value is rejected rather than read as "nothing".
  let scope: string = original_scopes.granted.join(" ");
  const requested_scope = param("scope");
  if (requested_scope !== null) {
    if (!oidcScopeSchema.safeParse(requested_scope).success) {
      return fail(
        oidcTokenErrorResponse("invalid_scope", "Malformed 'scope' parameter."),
      );
    }
    const requested = parseAndGrantScopes(requested_scope);
    const isSubset = requested.granted.every((s) =>
      original_scopes.granted.includes(s),
    );
    if (!isSubset) {
      return fail(
        oidcTokenErrorResponse(
          "invalid_scope",
          "Requested scope exceeds the originally granted scope.",
        ),
      );
    }
    scope = requested.granted.join(" ");
  }

  const issued = await issueOidcTokens({
    dbh,
    user,
    client_app_id,
    scope,
    nonce: null,
    grant_type: "refresh_token",
    environment,
    // OIDC Core §12.2 permits omitting the id_token on refresh.
    include_id_token: false,
    access_token_audience: resource ?? undefined,
    // Refresh token rotation: the presented token is single-use — its
    // revocation commits in the same transaction as the replacement
    // tokens' issuance records, and a failure throws (failing closed via
    // the route's shared catch). Legacy tokens minted before jti tracking
    // have nothing to revoke — they still rotate.
    revoke_rotated_refresh_token: decoded.jti
      ? {
          jti: decoded.jti,
          uid: decoded.uid,
          expires_at: Date.now() + refreshTokenExpiry * 1000,
        }
      : undefined,
    debug,
  });

  return { ok: true, issued };
}

export default handleOidcRefreshTokenGrant;
