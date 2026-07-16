// GET /openid-client/callback
//
// OIDC redirect_uri for the openid-client demo sign-in flow. Redeems
// the authorization code at the auth server's token endpoint via
// `openid-client`'s authorizationCodeGrant() — which enforces the
// `state`/`iss` authorization-response checks, sends the PKCE
// code_verifier, and validates the returned id_token (RS256 signature
// against the discovered jwks_uri, iss/aud/exp, and the expected
// `nonce`) — then cross-checks the identity with the userinfo endpoint
// and stores the resulting claims in an httpOnly session cookie read by
// /openid-client/profile.

import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import * as oidc from "openid-client";
import {
  CALLBACK_PATH,
  COOKIE_PATH,
  NONCE_COOKIE,
  PKCE_VERIFIER_COOKIE,
  PROFILE_PATH,
  SESSION_COOKIE,
  STATE_COOKIE,
  discoverAuthServer,
  getPublicOrigin,
  type OpenidClientDemoSession,
} from "@/lib/openid-client-demo";

/** Lifetime of the demo session cookie (seconds). */
const SESSION_COOKIE_MAX_AGE = 60 * 60;

function callbackError(message: string, cause?: unknown): NextResponse {
  console.error(`[openid-client-demo] ${message}`, cause ?? "");
  return NextResponse.json(
    {
      error: "openid_client_callback_failed",
      error_description: message,
    },
    { status: 400 },
  );
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const pkceCodeVerifier: string | undefined =
    request.cookies.get(PKCE_VERIFIER_COOKIE)?.value;
  const expectedState: string | undefined =
    request.cookies.get(STATE_COOKIE)?.value;
  const expectedNonce: string | undefined =
    request.cookies.get(NONCE_COOKIE)?.value;
  if (!pkceCodeVerifier || !expectedState || !expectedNonce) {
    return callbackError(
      "Missing PKCE/state/nonce cookies — was the flow started at /openid-client/login?",
    );
  }

  const config: oidc.Configuration = await discoverAuthServer();

  // Rebuild the callback URL from the public origin so the
  // redirect_uri sent to the token endpoint (currentUrl minus its query
  // string) is byte-identical to the one from the authorize request.
  const origin: string = getPublicOrigin(request);
  const currentUrl = new URL(
    `${origin}${CALLBACK_PATH}${request.nextUrl.search}`,
  );

  let tokens: oidc.TokenEndpointResponse & oidc.TokenEndpointResponseHelpers;
  try {
    tokens = await oidc.authorizationCodeGrant(config, currentUrl, {
      pkceCodeVerifier,
      expectedState,
      expectedNonce,
      idTokenExpected: true,
    });
  } catch (e: unknown) {
    return callbackError(
      `Authorization code grant failed: ${e instanceof Error ? e.message : String(e)}`,
      e,
    );
  }

  const claims: oidc.IDToken | undefined = tokens.claims();
  if (!claims) {
    return callbackError("Token response did not include an id_token!");
  }

  let userinfo: oidc.UserInfoResponse;
  try {
    userinfo = await oidc.fetchUserInfo(
      config,
      tokens.access_token,
      claims.sub,
    );
  } catch (e: unknown) {
    return callbackError(
      `Userinfo request failed: ${e instanceof Error ? e.message : String(e)}`,
      e,
    );
  }

  const session: OpenidClientDemoSession = {
    sub: claims.sub,
    iss: claims.iss,
    aud: claims.aud,
    userinfo: {
      sub: userinfo.sub,
      email: typeof userinfo.email === "string" ? userinfo.email : undefined,
      email_verified:
        typeof userinfo.email_verified === "boolean"
          ? userinfo.email_verified
          : undefined,
    },
  };

  const response = NextResponse.redirect(
    new URL(`${origin}${PROFILE_PATH}`),
    303,
  );
  const secure: boolean = origin.startsWith("https:");
  for (const transient of [PKCE_VERIFIER_COOKIE, STATE_COOKIE, NONCE_COOKIE]) {
    response.cookies.set(transient, "", {
      httpOnly: true,
      sameSite: "lax",
      secure,
      path: COOKIE_PATH,
      maxAge: 0,
    });
  }
  response.cookies.set(SESSION_COOKIE, JSON.stringify(session), {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: COOKIE_PATH,
    maxAge: SESSION_COOKIE_MAX_AGE,
  });
  return response;
}

export const dynamic = "force-dynamic";
