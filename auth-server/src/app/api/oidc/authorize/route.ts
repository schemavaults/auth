import "server-only";
import type { ServerRuntime } from "next";
import { NextResponse, type NextRequest } from "next/server";
import { ServerlessDatabase } from "@/lib/auth-db";
import { getAuthServerUri } from "@/lib/auth_server_uri";
import validateOidcAuthorizeRequest from "@/lib/oidc/validate-authorize-request";

/**
 * The OIDC authorization endpoint (RFC 6749 §3.1). Validates the
 * standard request parameters, then bridges into the platform's
 * existing login/consent/MFA UI by redirecting to /auth/login with the
 * custom-surface query parameters plus the OIDC extras (`oidc=1`,
 * `nonce`, `scope`). The login flow threads those through to the
 * authorization-code row, and in OIDC mode the callback emitters return
 * `?code=...&state=...&iss=...` to the RP instead of the custom
 * `authorization_code`/`challenge_time` parameters.
 *
 * `challenge_time` is an SDK-internal timestamp standard RPs don't
 * send; it is synthesized here (it does not enter the PKCE hash — it
 * only anchors the challenge-expiry window, and the token endpoint
 * reads the stored value back off the code row).
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  await using dbh = ServerlessDatabase.createDBH();

  const validation = await validateOidcAuthorizeRequest(
    request.nextUrl.searchParams,
    dbh,
  );
  if (validation.kind === "response") {
    return validation.response;
  }
  const { client_app_id, redirect_uri, scope, state, nonce, code_challenge } =
    validation.request;

  const bridge = new URL("/auth/login", getAuthServerUri());
  bridge.searchParams.set("app_id", client_app_id);
  bridge.searchParams.set("code_challenge", code_challenge);
  bridge.searchParams.set("code_challenge_method", "S256");
  bridge.searchParams.set("challenge_time", `${Date.now()}`);
  bridge.searchParams.set("redirect_uri", redirect_uri);
  if (state) {
    bridge.searchParams.set("state", state);
  }
  bridge.searchParams.set("oidc", "1");
  if (nonce) {
    bridge.searchParams.set("nonce", nonce);
  }
  bridge.searchParams.set("scope", scope);

  return NextResponse.redirect(bridge, {
    status: 302,
    headers: { "Cache-Control": "no-store" },
  });
}

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
