import "server-only";
import type { ServerRuntime } from "next";
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
  type UserDocument,
} from "@/lib/auth-db";
import getAuthServerAppId from "@/lib/config/auth-server-app-id";

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
 * The OIDC userinfo endpoint (OIDC Core §5.3): accepts the JWE access
 * token issued by /api/oidc/token as a Bearer credential, decrypts and
 * verifies it server-side (only the auth server holds the
 * `oidc-userinfo` keyset), and returns the claims permitted by the
 * token's granted scope.
 */
async function handleUserinfo(request: NextRequest): Promise<NextResponse> {
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

  let decoded: CustomJWTPayload;
  try {
    // The token header names its keyset and audience; only tokens
    // minted for the reserved OIDC audience are accepted here.
    const token_audience: string = getAudienceFromToken(token, environment);
    if (token_audience !== OIDC_USERINFO_AUDIENCE_ID) {
      return unauthorized("Token audience is not the OIDC userinfo audience");
    }
    const keyset_id: string = getKeysetIdFromToken(token);

    const keyset: I_JWT_Keys = await new AuthServerJwtKeysManager(
      dbh.db,
    ).getKeyset(OIDC_USERINFO_AUDIENCE_ID, keyset_id);
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

  // Claims filtered by the granted scope embedded in the token; `sub`
  // is always returned (OIDC Core §5.3.2) in the OIDC-facing
  // `<auth_server_app_id>|<uid>` form — it MUST exactly match the
  // id_token's `sub`, which RP libraries verify.
  const { granted } = parseAndGrantScopes(decoded.scope);
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
    }
  }

  return NextResponse.json(claims, {
    headers: {
      "Cache-Control": "no-store",
      ...CORS_HEADERS,
    },
  });
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  return handleUserinfo(request);
}

// OIDC Core §5.3.1 allows POST with the token in the Authorization
// header (form-body token delivery is not supported here).
export async function POST(request: NextRequest): Promise<NextResponse> {
  return handleUserinfo(request);
}

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
