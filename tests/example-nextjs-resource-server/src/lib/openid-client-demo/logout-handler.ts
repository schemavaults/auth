// openid-client-demo/logout-handler.ts
//
// Shared POST handler for the demo relying parties' /logout routes.
//
// Signs the user out of the *relying party* by clearing the httpOnly
// cookies this variant's flow wrote, then sends the browser back to the
// profile page, which then renders its signed-out state.
//
// This is a local RP logout only — it does not end the user's session
// at the auth server. RP-initiated logout (OIDC Session Management /
// RFC 7009 token revocation) is not part of the auth server's spec
// surface: its discovery document advertises no `end_session_endpoint`,
// so there is nowhere for a spec-compliant client to redirect. Starting
// the flow again at ./login-handler.ts therefore signs straight back in
// from the auth server's still-live session cookie, which is the
// correct behaviour for a single-RP sign-out.
//
// POST-only on purpose: a logout reachable by GET can be fired by a
// link prefetch or a cross-site <img>/<iframe>, so the profile page
// submits a form instead of linking (see ./profile.tsx).

import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import {
  getOpenidClientDemoConfig,
  getPublicOrigin,
  type OpenidClientDemoConfig,
  type OpenidClientDemoVariant,
} from "./config";

export async function handleOpenidClientDemoLogout(
  request: NextRequest,
  variant: OpenidClientDemoVariant,
): Promise<NextResponse> {
  const demo: OpenidClientDemoConfig = getOpenidClientDemoConfig(variant);
  const origin: string = getPublicOrigin(request);

  // 303 See Other so the browser follows up with a GET: a POST
  // redirected with 307/308 would replay the body against the profile
  // page.
  const response = NextResponse.redirect(
    new URL(`${origin}${demo.profilePath}`),
    303,
  );

  // Clear the session cookie plus any transient PKCE/state/nonce
  // cookies left behind by an abandoned authorize redirect, so logging
  // out resets this variant's cookie jar completely. Each must be
  // expired with the same path it was written with.
  const secure: boolean = origin.startsWith("https:");
  for (const cookieName of [
    demo.sessionCookie,
    demo.pkceVerifierCookie,
    demo.stateCookie,
    demo.nonceCookie,
  ]) {
    response.cookies.set(cookieName, "", {
      httpOnly: true,
      sameSite: "lax",
      secure,
      path: demo.cookiePath,
      maxAge: 0,
    });
  }
  return response;
}
