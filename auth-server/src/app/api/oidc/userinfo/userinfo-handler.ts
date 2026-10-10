import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import {
  OIDC_USERINFO_AUDIENCE_ID,
  getAppEnvironment,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import {
  buildOidcProfileClaims,
  formatOidcSubClaim,
  parseAndGrantScopes,
} from "@schemavaults/auth-common";
import {
  decodeJWT,
  getAudienceFromToken,
  getKeysetIdFromToken,
  type CustomJWTPayload,
  type I_JWT_Keys,
} from "@schemavaults/jwt";
import AuthServerJwtKeysManager from "@/lib/AuthServerJwtKeysManager";
import {
  ServerlessDatabase,
  UserRegistry,
  getUserTokensValidAfter,
  isTokenIatRevoked,
  isTokenRevoked,
  type UserDocument,
} from "@/lib/auth-db";
import getAuthServerAppId from "@/lib/config/auth-server-app-id";
import captureServerException from "@/lib/captureServerException";

const ROUTE = "/api/oidc/userinfo";

// CORS: browser-based RPs call userinfo cross-origin with a Bearer
// token (no cookies), so a wildcard origin is safe.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
} as const;

function unauthorized(error_description?: string): NextResponse {
  const challenge = error_description
    ? `Bearer error="invalid_token", error_description="${error_description}"`
    : "Bearer";
  return NextResponse.json(
    { error: "invalid_token" },
    {
      status: 401,
      headers: {
        "WWW-Authenticate": challenge,
        "Cache-Control": "no-store",
        ...CORS_HEADERS,
      },
    },
  );
}

/**
 * RFC 6750 §3.1: the token is valid but its granted scope does not cover
 * this endpoint. Only tokens minted for an OpenID Connect authentication
 * request (granted scope includes `openid`) identify the user here; a
 * token from a plain OAuth 2.1 grant carries no identity claims at all.
 */
function insufficientScope(): NextResponse {
  return NextResponse.json(
    { error: "insufficient_scope" },
    {
      status: 403,
      headers: {
        "WWW-Authenticate":
          'Bearer error="insufficient_scope", error_description="The \'openid\' scope is required to access userinfo", scope="openid"',
        "Cache-Control": "no-store",
        ...CORS_HEADERS,
      },
    },
  );
}

/** CORS preflight for GET / POST userinfo. */
export async function handleOidcUserinfoPreflight(): Promise<NextResponse> {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

/**
 * The OIDC userinfo endpoint (OIDC Core §5.3): accepts the JWE access
 * token issued by /api/oidc/token as a Bearer credential, decrypts and
 * verifies it server-side (only the auth server holds the
 * `oidc-userinfo` keyset), and returns the claims permitted by the
 * token's granted scope. A token that verified but has since been
 * revoked — its jti revoked by logout, or minted before the user's
 * `tokens_valid_after` watermark (password reset, disabled account) —
 * is refused with `invalid_token`, exactly as at introspection and the
 * route guards. Tokens whose grant did not include `openid` (plain
 * OAuth 2.1 grants) are refused with `insufficient_scope`.
 *
 * Served for GET and POST alike (OIDC Core §5.3.1 allows POST with the
 * token in the Authorization header; form-body token delivery is not
 * supported here).
 */
export async function handleOidcUserinfoRequest(request: NextRequest): Promise<NextResponse> {
  const environment: SchemaVaultsAppEnvironment = getAppEnvironment();

  const authorization = request.headers.get("Authorization");
  if (!authorization) {
    return NextResponse.json(
      { error: "invalid_request" },
      {
        status: 401,
        headers: {
          "WWW-Authenticate": "Bearer",
          "Cache-Control": "no-store",
          ...CORS_HEADERS,
        },
      },
    );
  }
  const [scheme, token] = authorization.split(" ");
  if (scheme !== "Bearer" || !token) {
    return unauthorized("Malformed Authorization header");
  }

  // The DB handle outlives token validation: the `profile` scope's
  // claims are read fresh from the USERS row rather than the token.
  await using dbh = ServerlessDatabase.createDBH();

  let keyset_id: string;
  try {
    // The token header names its keyset and audience; only tokens
    // minted for the reserved OIDC audience are accepted here.
    const token_audience: string = getAudienceFromToken(token, environment);
    if (token_audience !== OIDC_USERINFO_AUDIENCE_ID) {
      return unauthorized("Token audience is not the OIDC userinfo audience");
    }
    keyset_id = getKeysetIdFromToken(token);
  } catch {
    return unauthorized("Token could not be validated");
  }

  let keyset: I_JWT_Keys | null;
  try {
    keyset = await new AuthServerJwtKeysManager(dbh.db).findKeyset(
      OIDC_USERINFO_AUDIENCE_ID,
      keyset_id,
    );
  } catch (e: unknown) {
    // Fail closed, but record it: this is an outage, not a bad token.
    await captureServerException(dbh.db, e, {
      op_name: "oidcUserinfo.findKeyset",
      route: ROUTE,
      context: { keyset_id },
    });
    return unauthorized("Token could not be validated");
  }
  if (!keyset) {
    return unauthorized("Token could not be validated");
  }

  let decoded: CustomJWTPayload;
  try {
    decoded = await decodeJWT({
      type: "access",
      jwt: token,
      audience: OIDC_USERINFO_AUDIENCE_ID,
      jwt_keys: keyset,
      env: environment,
    });
  } catch {
    return unauthorized("Token could not be validated");
  }

  if (decoded.disabled) {
    return unauthorized("Account is disabled");
  }

  // Revocation: cryptographic validity is not enough. The token is also
  // refused when its jti was revoked (the RP's logout revokes the access
  // tokens issued alongside the session's refresh token) or when it
  // predates the user's `tokens_valid_after` watermark (password reset,
  // account disabled) — the same two signals the route guards and the
  // introspection endpoint consult. Like introspection, no
  // rotation-reuse grace applies here: access tokens are never
  // rotation-revoked, so a revoked one is refused immediately.
  try {
    if (decoded.jti && (await isTokenRevoked(dbh.db, decoded.jti))) {
      return unauthorized("Token has been revoked");
    }
    const tokens_valid_after: number = await getUserTokensValidAfter(
      dbh.db,
      decoded.uid,
    );
    if (isTokenIatRevoked(decoded.iat, tokens_valid_after)) {
      return unauthorized("Token has been revoked");
    }
  } catch (e: unknown) {
    // Fail closed: if the revocation state cannot be read, the token's
    // standing is unknown and it must not be honoured.
    console.error(
      "[/api/oidc/userinfo] Failed to check token revocation:",
      e,
    );
    await captureServerException(dbh.db, e, {
      op_name: "oidcUserinfo.checkRevocation",
      route: ROUTE,
      uid: decoded.uid,
    });
    return unauthorized("Token could not be validated");
  }

  // Claims filtered by the granted scope embedded in the token; `sub`
  // is always returned (OIDC Core §5.3.2) in the OIDC-facing
  // `<auth_server_app_id>|<uid>` form — it MUST exactly match the
  // id_token's `sub`, which RP libraries verify.
  const { granted, hasOpenid } = parseAndGrantScopes(decoded.scope);
  if (!hasOpenid) {
    return insufficientScope();
  }
  const claims: Record<string, unknown> = {
    sub: formatOidcSubClaim(getAuthServerAppId(), decoded.sub),
  };
  if (granted.includes("email")) {
    claims.email = decoded.email;
    claims.email_verified = decoded.email_verified;
  }
  if (granted.includes("profile")) {
    // Profile name claims are not embedded in the access token — read
    // them fresh from the USERS row so edits on /account are reflected
    // immediately. The same builder derives the id_token's claims, so
    // the two surfaces agree for the same user (OIDC Core §5.1/§5.3.2).
    try {
      const userDoc: UserDocument | null = await new UserRegistry(
        dbh.db,
      ).getUserByUID(decoded.uid);
      if (userDoc) {
        Object.assign(claims, buildOidcProfileClaims(userDoc));
      }
    } catch (e: unknown) {
      // A failed profile read degrades to omitting the optional profile
      // claims (`sub` — and `email` when granted — still identify the
      // user) rather than failing the whole userinfo response.
      console.error(
        "[/api/oidc/userinfo] Failed to load profile claims:",
        e,
      );
      await captureServerException(dbh.db, e, {
        op_name: "oidcUserinfo.loadProfileClaims",
        route: ROUTE,
        uid: decoded.uid,
        context: { nonFatal: true },
      });
    }
  }

  return NextResponse.json(claims, {
    headers: {
      "Cache-Control": "no-store",
      ...CORS_HEADERS,
    },
  });
}
