// openid-client-demo/login-handler.ts
//
// Shared GET handler for the demo relying parties' /login routes.
//
// Starts an OIDC authorization-code + PKCE sign-in against the auth
// server using the generic `openid-client` npm package (no
// @schemavaults/auth-* SDK involved — see ./config.ts). Generates the
// PKCE verifier/challenge, `state`, and `nonce`, stashes them in
// short-lived httpOnly cookies scoped to the variant's route tree, and
// redirects the browser to the discovered authorization endpoint.

import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import * as oidc from "openid-client";
import {
  discoverAuthServer,
  getOpenidClientDemoConfig,
  getPublicOrigin,
  type OpenidClientDemoConfig,
  type OpenidClientDemoVariant,
} from "./config";

/** Lifetime of the transient PKCE/state/nonce cookies (seconds). */
const TRANSIENT_COOKIE_MAX_AGE = 60 * 10;

export async function handleOpenidClientDemoLogin(
  request: NextRequest,
  variant: OpenidClientDemoVariant,
): Promise<NextResponse> {
  const demo: OpenidClientDemoConfig = getOpenidClientDemoConfig(variant);
  const config: oidc.Configuration = await discoverAuthServer(variant);

  const code_verifier: string = oidc.randomPKCECodeVerifier();
  const code_challenge: string =
    await oidc.calculatePKCECodeChallenge(code_verifier);
  const state: string = oidc.randomState();
  const nonce: string = oidc.randomNonce();

  const origin: string = getPublicOrigin(request);
  const redirect_uri: string = `${origin}${demo.callbackPath}`;

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
    path: demo.cookiePath,
    maxAge: TRANSIENT_COOKIE_MAX_AGE,
  } as const;
  response.cookies.set(demo.pkceVerifierCookie, code_verifier, cookieOptions);
  response.cookies.set(demo.stateCookie, state, cookieOptions);
  response.cookies.set(demo.nonceCookie, nonce, cookieOptions);
  return response;
}
