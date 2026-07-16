// GET /openid-client/login
//
// Starts an OIDC authorization-code + PKCE sign-in against the auth
// server using the generic `openid-client` npm package (no
// @schemavaults/auth-* SDK involved — see src/lib/openid-client-demo).
// Generates the PKCE verifier/challenge, `state`, and `nonce`, stashes
// them in short-lived httpOnly cookies, and redirects the browser to
// the discovered authorization endpoint.

import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import * as oidc from "openid-client";
import {
  CALLBACK_PATH,
  COOKIE_PATH,
  NONCE_COOKIE,
  PKCE_VERIFIER_COOKIE,
  STATE_COOKIE,
  discoverAuthServer,
  getPublicOrigin,
} from "@/lib/openid-client-demo";

/** Lifetime of the transient PKCE/state/nonce cookies (seconds). */
const TRANSIENT_COOKIE_MAX_AGE = 60 * 10;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const config: oidc.Configuration = await discoverAuthServer();

  const code_verifier: string = oidc.randomPKCECodeVerifier();
  const code_challenge: string =
    await oidc.calculatePKCECodeChallenge(code_verifier);
  const state: string = oidc.randomState();
  const nonce: string = oidc.randomNonce();

  const origin: string = getPublicOrigin(request);
  const redirect_uri: string = `${origin}${CALLBACK_PATH}`;

  const authorizationUrl: URL = oidc.buildAuthorizationUrl(config, {
    redirect_uri,
    scope: "openid email",
    state,
    nonce,
    code_challenge,
    code_challenge_method: "S256",
  });

  const response = NextResponse.redirect(authorizationUrl, 302);
  const cookieOptions = {
    httpOnly: true,
    sameSite: "lax",
    secure: origin.startsWith("https:"),
    path: COOKIE_PATH,
    maxAge: TRANSIENT_COOKIE_MAX_AGE,
  } as const;
  response.cookies.set(PKCE_VERIFIER_COOKIE, code_verifier, cookieOptions);
  response.cookies.set(STATE_COOKIE, state, cookieOptions);
  response.cookies.set(NONCE_COOKIE, nonce, cookieOptions);
  return response;
}

export const dynamic = "force-dynamic";
