import "server-only";
import type { ServerRuntime } from "next";
import { NextResponse, type NextRequest } from "next/server";
import {
  appIdSchema,
  getApiServerIdForTokenAudience,
  getAppEnvironment,
  type AppId,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import {
  parseAndGrantScopes,
  PKCE_ProofKeyManager,
  type UserData,
} from "@schemavaults/auth-common";
import {
  decodeJWT,
  getAudienceFromToken,
  getKeysetIdFromToken,
  type CustomJWTPayload,
  type I_JWT_Keys,
} from "@schemavaults/jwt";
import getAuthServerAppId from "@/lib/config/auth-server-app-id";
import shouldEnableDebug from "@/lib/should-enable-debug";
import {
  ServerlessDatabase,
  UserRegistry,
  getUserTokensValidAfter,
  isTokenIatRevoked,
  isTokenRevoked,
  loadUserData,
} from "@/lib/auth-db";
import isAppAuthorizedForUser from "@/lib/auth-db/apps/authorized-apps-registry/is-app-authorized-for-user";
import AuthServerJwtKeysManager from "@/lib/AuthServerJwtKeysManager";
import captureServerException from "@/lib/captureServerException";
import { oidcTokenErrorResponse } from "@/lib/oidc/oidc-errors";
import issueOidcTokens, {
  type OidcTokenResponseBody,
} from "@/lib/oidc/issue-oidc-tokens";

const ROUTE = "/api/oidc/token";

// CORS: the endpoint serves third-party public clients (PKCE, no
// cookies, credentials in the form body) so a wildcard origin is safe.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
} as const;

function ok(body: OidcTokenResponseBody): NextResponse {
  return NextResponse.json(body, {
    status: 200,
    headers: {
      "Cache-Control": "no-store",
      Pragma: "no-cache",
      ...CORS_HEADERS,
    },
  });
}

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

/**
 * The OIDC token endpoint (RFC 6749 §3.2, form-encoded): exchanges an
 * OIDC-minted authorization code (grant_type=authorization_code) or an
 * OIDC refresh token (grant_type=refresh_token) for the standard token
 * response — with the refresh token inlined and an id_token on the code
 * grant. Codes and refresh tokens from the custom surface are rejected,
 * keeping the two surfaces isolated.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const environment: SchemaVaultsAppEnvironment = getAppEnvironment();
  const debug: boolean = shouldEnableDebug(environment);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return oidcTokenErrorResponse(
      "invalid_request",
      "Request body must be application/x-www-form-urlencoded.",
    );
  }
  const param = (name: string): string | null => {
    const value = form.get(name);
    return typeof value === "string" && value.length > 0 ? value : null;
  };

  const grant_type = param("grant_type");
  if (grant_type !== "authorization_code" && grant_type !== "refresh_token") {
    return oidcTokenErrorResponse(
      "unsupported_grant_type",
      "grant_type must be 'authorization_code' or 'refresh_token'.",
    );
  }

  const parsed_client_id = appIdSchema.safeParse(param("client_id"));
  if (!parsed_client_id.success) {
    return oidcTokenErrorResponse(
      "invalid_request",
      "Missing or malformed 'client_id' parameter.",
    );
  }
  const client_app_id: AppId = parsed_client_id.data;

  await using dbh: ServerlessDatabase = ServerlessDatabase.createDBH();

  try {
    if (grant_type === "authorization_code") {
      return await handleOidcAuthorizationCodeGrant(
        dbh,
        param,
        client_app_id,
        environment,
        debug,
      );
    }
    return await handleOidcRefreshTokenGrant(
      dbh,
      param,
      client_app_id,
      environment,
      debug,
    );
  } catch (e: unknown) {
    await captureServerException(dbh.db, e, {
      op_name: "oidcToken.POST",
      route: ROUTE,
      context: { client_app_id, grant_type },
    });
    return oidcTokenErrorResponse(
      "invalid_request",
      "Failed to process the token request.",
      500,
    );
  }
}

async function handleOidcAuthorizationCodeGrant(
  dbh: ServerlessDatabase,
  param: (name: string) => string | null,
  client_app_id: AppId,
  environment: SchemaVaultsAppEnvironment,
  debug: boolean,
): Promise<NextResponse> {
  const code = param("code");
  const redirect_uri = param("redirect_uri");
  const code_verifier = param("code_verifier");
  if (!code) {
    return oidcTokenErrorResponse(
      "invalid_request",
      "Missing 'code' parameter.",
    );
  }
  if (!redirect_uri) {
    return oidcTokenErrorResponse(
      "invalid_request",
      "Missing 'redirect_uri' parameter.",
    );
  }
  if (
    !code_verifier ||
    !PKCE_ProofKeyManager.codeVerifierSchema.safeParse(code_verifier).success
  ) {
    return oidcTokenErrorResponse(
      "invalid_request",
      "Missing or malformed 'code_verifier' parameter (PKCE is required).",
    );
  }

  const userRegistry = new UserRegistry(dbh.db, debug);

  // challenge_time is passed as null: standard RPs never see that
  // SDK-internal value, so the redemption uses the one stored on the
  // code row at issuance (it does not feed the PKCE hash).
  const consumed = await userRegistry.validateAndConsumeAuthorizationCode(
    code,
    client_app_id,
    code_verifier,
    null,
    redirect_uri,
  );
  if (!consumed) {
    return oidcTokenErrorResponse(
      "invalid_grant",
      "Invalid, expired, or already-used authorization code (or PKCE/redirect_uri mismatch).",
    );
  }
  // Surface isolation: codes minted by the custom (non-OIDC) flow are
  // not redeemable here.
  if (!consumed.oidc) {
    return oidcTokenErrorResponse(
      "invalid_grant",
      "This authorization code was not issued by the OIDC authorization endpoint.",
    );
  }

  const user: UserData = await loadUserData(consumed.uid, userRegistry);
  if (user.disabled) {
    return oidcTokenErrorResponse("invalid_grant", "Account is disabled.");
  }
  const appAuthorized: boolean = await isAppAuthorizedForUser(
    dbh.db,
    user.uid,
    client_app_id,
    debug,
  );
  if (!appAuthorized) {
    return oidcTokenErrorResponse(
      "invalid_grant",
      "The user has not authorized this client application.",
    );
  }

  const scope: string = consumed.scope || "openid";
  const body = await issueOidcTokens({
    dbh,
    user,
    client_app_id,
    scope,
    nonce: consumed.nonce,
    grant_type: "authorization_code",
    environment,
    include_id_token: true,
    debug,
  });
  return ok(body);
}

async function handleOidcRefreshTokenGrant(
  dbh: ServerlessDatabase,
  param: (name: string) => string | null,
  client_app_id: AppId,
  environment: SchemaVaultsAppEnvironment,
  debug: boolean,
): Promise<NextResponse> {
  const refresh_token = param("refresh_token");
  if (!refresh_token) {
    return oidcTokenErrorResponse(
      "invalid_request",
      "Missing 'refresh_token' parameter.",
    );
  }

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
      return oidcTokenErrorResponse(
        "invalid_grant",
        "Invalid refresh token audience.",
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
    return oidcTokenErrorResponse(
      "invalid_grant",
      "Invalid or expired refresh token.",
    );
  }

  // The refresh token must have been issued to this client...
  if (decoded.app !== client_app_id) {
    return oidcTokenErrorResponse(
      "invalid_grant",
      "Refresh token was not issued to this client.",
    );
  }
  // ...by the OIDC surface (custom-surface refresh tokens carry no
  // scope claim and are not redeemable here).
  const original_scopes = parseAndGrantScopes(decoded.scope);
  if (!original_scopes.hasOpenid) {
    return oidcTokenErrorResponse(
      "invalid_grant",
      "This refresh token was not issued by the OIDC token endpoint.",
    );
  }

  // Revocation checks: explicit jti revocation (logout) plus the
  // per-user tokens_valid_after watermark (password reset).
  if (decoded.jti && (await isTokenRevoked(dbh.db, decoded.jti))) {
    return oidcTokenErrorResponse(
      "invalid_grant",
      "Refresh token has been revoked.",
    );
  }
  const tokens_valid_after: number = await getUserTokensValidAfter(
    dbh.db,
    decoded.uid,
  );
  if (isTokenIatRevoked(decoded.iat, tokens_valid_after)) {
    return oidcTokenErrorResponse(
      "invalid_grant",
      "Refresh token has been revoked.",
    );
  }

  const userRegistry = new UserRegistry(dbh.db, debug);
  const user: UserData = await loadUserData(decoded.uid, userRegistry);
  if (user.disabled) {
    return oidcTokenErrorResponse("invalid_grant", "Account is disabled.");
  }
  const appAuthorized: boolean = await isAppAuthorizedForUser(
    dbh.db,
    user.uid,
    client_app_id,
    debug,
  );
  if (!appAuthorized) {
    return oidcTokenErrorResponse(
      "invalid_grant",
      "The user has not authorized this client application.",
    );
  }

  // RFC 6749 §6: a scope re-request must be a subset of the original
  // grant; absent means "same as originally granted".
  let scope: string = original_scopes.granted.join(" ");
  const requested_scope = param("scope");
  if (requested_scope !== null) {
    const requested = parseAndGrantScopes(requested_scope);
    const isSubset = requested.granted.every((s) =>
      original_scopes.granted.includes(s),
    );
    if (!requested.hasOpenid || !isSubset) {
      return oidcTokenErrorResponse(
        "invalid_scope",
        "Requested scope exceeds the originally granted scope.",
      );
    }
    scope = requested.granted.join(" ");
  }

  const body = await issueOidcTokens({
    dbh,
    user,
    client_app_id,
    scope,
    nonce: null,
    grant_type: "refresh_token",
    environment,
    // OIDC Core §12.2 permits omitting the id_token on refresh.
    include_id_token: false,
    debug,
  });
  return ok(body);
}

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
