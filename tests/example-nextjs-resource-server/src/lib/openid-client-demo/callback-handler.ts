// openid-client-demo/callback-handler.ts
//
// Shared GET handler for the demo relying parties' OIDC redirect_uri.
//
// Redeems the authorization code at the auth server's token endpoint
// via `openid-client`'s authorizationCodeGrant() — which enforces the
// `state`/`iss` authorization-response checks, sends the PKCE
// code_verifier (plus, for the confidential variant, the client secret
// via client_secret_basic), and validates the returned id_token (RS256
// signature against the discovered jwks_uri, iss/aud/exp, and the
// expected `nonce`) — then cross-checks the identity with the userinfo
// endpoint and stores the resulting claims in an httpOnly session
// cookie read by the variant's profile page.

import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import * as oidc from "openid-client";
import {
  discoverAuthServer,
  getOpenidClientDemoConfig,
  getPublicOrigin,
  type OpenidClientDemoConfig,
  type OpenidClientDemoSession,
  type OpenidClientDemoVariant,
} from "./config";

/** Lifetime of the demo session cookie (seconds). */
const SESSION_COOKIE_MAX_AGE = 60 * 60;

function callbackError(
  variant: OpenidClientDemoVariant,
  message: string,
  cause?: unknown,
): NextResponse {
  console.error(`[openid-client-demo:${variant}] ${message}`, cause ?? "");
  return NextResponse.json(
    {
      error: "openid_client_callback_failed",
      error_description: message,
    },
    { status: 400 },
  );
}

export async function handleOpenidClientDemoCallback(
  request: NextRequest,
  variant: OpenidClientDemoVariant,
): Promise<NextResponse> {
  const demo: OpenidClientDemoConfig = getOpenidClientDemoConfig(variant);

  const pkceCodeVerifier: string | undefined = request.cookies.get(
    demo.pkceVerifierCookie,
  )?.value;
  const expectedState: string | undefined = request.cookies.get(
    demo.stateCookie,
  )?.value;
  const expectedNonce: string | undefined = request.cookies.get(
    demo.nonceCookie,
  )?.value;
  if (!pkceCodeVerifier || !expectedState || !expectedNonce) {
    return callbackError(
      variant,
      `Missing PKCE/state/nonce cookies — was the flow started at ${demo.loginPath}?`,
    );
  }

  const config: oidc.Configuration = await discoverAuthServer(variant);

  // Rebuild the callback URL from the public origin so the
  // redirect_uri sent to the token endpoint (currentUrl minus its query
  // string) is byte-identical to the one from the authorize request.
  const origin: string = getPublicOrigin(request);
  const currentUrl = new URL(
    `${origin}${demo.callbackPath}${request.nextUrl.search}`,
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
      variant,
      `Authorization code grant failed: ${e instanceof Error ? e.message : String(e)}`,
      e,
    );
  }

  const claims: oidc.IDToken | undefined = tokens.claims();
  if (!claims) {
    return callbackError(variant, "Token response did not include an id_token!");
  }

  let userinfo: oidc.UserInfoResponse;
  try {
    userinfo = await oidc.fetchUserInfo(config, tokens.access_token, claims.sub);
  } catch (e: unknown) {
    return callbackError(
      variant,
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
      name: typeof userinfo.name === "string" ? userinfo.name : undefined,
      preferred_username:
        typeof userinfo.preferred_username === "string"
          ? userinfo.preferred_username
          : undefined,
    },
  };

  const response = NextResponse.redirect(
    new URL(`${origin}${demo.profilePath}`),
    303,
  );
  const secure: boolean = origin.startsWith("https:");
  for (const transient of [
    demo.pkceVerifierCookie,
    demo.stateCookie,
    demo.nonceCookie,
  ]) {
    response.cookies.set(transient, "", {
      httpOnly: true,
      sameSite: "lax",
      secure,
      path: demo.cookiePath,
      maxAge: 0,
    });
  }
  response.cookies.set(demo.sessionCookie, JSON.stringify(session), {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: demo.cookiePath,
    maxAge: SESSION_COOKIE_MAX_AGE,
  });
  return response;
}
