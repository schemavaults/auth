import "server-only";
import { NextResponse } from "next/server";
import { getAuthServerUri } from "@/lib/auth_server_uri";

/**
 * RFC 6749 §4.1.2.1 / §5.2 + OIDC Core §3.1.2.6 error codes used by the
 * parallel OIDC surface.
 */
export type OidcAuthorizeErrorCode =
  | "invalid_request"
  | "unauthorized_client"
  | "access_denied"
  | "unsupported_response_type"
  | "invalid_scope"
  | "server_error"
  | "temporarily_unavailable"
  | "login_required"
  | "interaction_required"
  | "request_not_supported"
  | "request_uri_not_supported";

export type OidcTokenErrorCode =
  | "invalid_request"
  | "invalid_client"
  | "invalid_grant"
  | "unauthorized_client"
  | "unsupported_grant_type"
  | "invalid_scope";

/**
 * RFC 6749 §4.1.2.1 error redirect back to the RP's redirect_uri.
 * Only call this AFTER `client_id` and `redirect_uri` have been
 * validated — errors in those two parameters must never redirect
 * (use a direct 400 instead).
 *
 * Includes `iss` per RFC 9207 (the discovery document advertises
 * authorization_response_iss_parameter_supported: true).
 */
export function oidcAuthorizeErrorRedirect(
  redirect_uri: string,
  error: OidcAuthorizeErrorCode,
  error_description: string | null,
  state: string | null,
): NextResponse {
  const location = new URL(redirect_uri);
  location.searchParams.set("error", error);
  if (error_description) {
    location.searchParams.set("error_description", error_description);
  }
  if (state) {
    location.searchParams.set("state", state);
  }
  location.searchParams.set("iss", getAuthServerUri());
  return NextResponse.redirect(location, {
    status: 302,
    headers: { "Cache-Control": "no-store" },
  });
}

/**
 * RFC 6749 §5.2 token-endpoint error response (also used by /userinfo
 * for JSON error bodies where a WWW-Authenticate 401 is not required).
 */
export function oidcTokenErrorResponse(
  error: OidcTokenErrorCode,
  error_description: string | null = null,
  status: number = 400,
): NextResponse {
  return NextResponse.json(
    {
      error,
      ...(error_description ? { error_description } : {}),
    },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
        Pragma: "no-cache",
        "Access-Control-Allow-Origin": "*",
      },
    },
  );
}

/**
 * Direct 400 for errors in `client_id`/`redirect_uri` themselves —
 * RFC 6749 §4.1.2.1 forbids redirecting the user-agent to an
 * unvalidated redirect_uri.
 */
export function oidcAuthorizeDirectError(
  error: OidcAuthorizeErrorCode,
  error_description: string,
): NextResponse {
  return NextResponse.json(
    { error, error_description },
    { status: 400, headers: { "Cache-Control": "no-store" } },
  );
}
