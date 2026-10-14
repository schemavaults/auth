import {
  MaximumBrowserCookieSize,
  OIDC_TOKEN_REFRESH_TOKEN_DELIVERY_PARAM,
  getOidcEndpointUrl,
} from "@schemavaults/auth-common";
import getStringByteSize from "@/getStringByteSize";
import { serializeClearedSessionCookie, serializeSessionCookie } from "./session-cookie";
import {
  type AuthSessionRouteHandler,
  type AuthSessionRouteOptions,
  type SessionRouteRequest,
  createSessionRoute,
  json,
} from "./session-route-context";

function oauthError(status: number, error: string, error_description: string): Response {
  return json(status, { error, error_description });
}

async function handleToken({
  request,
  config,
  cookie,
  refresh_token,
  callAuthServer,
}: SessionRouteRequest): Promise<Response> {
  const form = new URLSearchParams(await request.text());
  if (form.get("client_id") !== config.client_app_id) {
    return oauthError(400, "invalid_client", "This session route serves another client.");
  }
  const grant_type: string | null = form.get("grant_type");
  // The auth server answers this route inline; the route alone decides
  // where the refresh token goes.
  form.delete(OIDC_TOKEN_REFRESH_TOKEN_DELIVERY_PARAM);
  form.delete("client_secret");
  if (grant_type === "refresh_token") {
    if (!refresh_token) {
      return oauthError(400, "invalid_grant", "No session: sign in again.");
    }
    form.set("refresh_token", refresh_token);
  } else if (grant_type === "authorization_code") {
    form.delete("refresh_token");
  } else {
    return oauthError(400, "unsupported_grant_type", "Only authorization_code and refresh_token grants are served here.");
  }

  const headers = new Headers({
    "Content-Type": "application/x-www-form-urlencoded",
    Accept: "application/json",
  });
  const origin: string | null = request.headers.get("origin");
  if (origin) headers.set("Origin", origin);

  let upstream: Response;
  let body: Record<string, unknown>;
  try {
    upstream = await callAuthServer(getOidcEndpointUrl(config.auth_server_url, "token"), {
      method: "POST",
      headers,
      body: form.toString(),
    });
    const parsed: unknown = JSON.parse(await upstream.text());
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new TypeError("token response is not a JSON object");
    }
    body = parsed as Record<string, unknown>;
  } catch (e: unknown) {
    console.error("[auth-session-route] Token request to the auth server failed:", e);
    return oauthError(502, "temporarily_unavailable", "The auth server could not be reached.");
  }

  const response_headers = new Headers();
  for (const name of ["WWW-Authenticate", "Retry-After"]) {
    const value: string | null = upstream.headers.get(name);
    if (value) response_headers.set(name, value);
  }

  if (upstream.ok && typeof body.refresh_token === "string") {
    const issued_refresh_token: string = body.refresh_token;
    delete body.refresh_token;
    if (getStringByteSize(issued_refresh_token) > MaximumBrowserCookieSize) {
      console.error("[auth-session-route] The refresh token does not fit in a cookie.");
      return oauthError(500, "server_error", "The session could not be stored.");
    }
    const expires_in: number =
      typeof body.refresh_token_expires_in === "number" ? body.refresh_token_expires_in : 0;
    response_headers.append(
      "Set-Cookie",
      serializeSessionCookie(cookie.name, issued_refresh_token, expires_in, cookie.attrs),
    );
  } else if (grant_type === "refresh_token" && body.error === "invalid_grant") {
    response_headers.append("Set-Cookie", serializeClearedSessionCookie(cookie.name, cookie.attrs));
  }
  return json(upstream.status, body, response_headers);
}

/**
 * The token session route (`POST`): the SDK's authorization code and refresh grants.
 * Forwarded to the auth server's token endpoint; the refresh token goes into
 * the session cookie (a refresh grant presents the cookie's), never into the
 * response body. In Next.js, `app/auth/session/token/route.ts`:
 *
 * ```ts
 * export const { POST } = createAuthSessionTokenRoute();
 * ```
 */
export function createAuthSessionTokenRoute(
  options: AuthSessionRouteOptions = {},
): { POST: AuthSessionRouteHandler } {
  return { POST: createSessionRoute(options, handleToken) };
}

export default createAuthSessionTokenRoute;
