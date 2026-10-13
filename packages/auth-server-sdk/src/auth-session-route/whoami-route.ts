import { serializeClearedSessionCookie } from "./session-cookie";
import {
  type AuthSessionRouteHandler,
  type AuthSessionRouteOptions,
  type SessionRouteRequest,
  authServerAppEndpoint,
  bearerHeaders,
  createSessionRoute,
  json,
  noStoreHeaders,
} from "./session-route-context";

async function handleWhoami({
  request,
  config,
  cookie,
  refresh_token,
  callAuthServer,
}: SessionRouteRequest): Promise<Response> {
  if (!refresh_token) {
    return json(401, { success: false, error: "unauthorized", message: "Authentication required" });
  }
  let upstream: Response;
  let text: string;
  try {
    upstream = await callAuthServer(authServerAppEndpoint(config, "whoami"), {
      method: "GET",
      headers: bearerHeaders(request, refresh_token),
    });
    text = await upstream.text();
  } catch (e: unknown) {
    console.error("[auth-session-route] whoami request to the auth server failed:", e);
    return json(502, { success: false, error: "bad_gateway", message: "The auth server could not be reached." });
  }
  const response_headers: Headers = noStoreHeaders({
    "Content-Type": upstream.headers.get("content-type") ?? "application/json",
  });
  if (upstream.status === 401) {
    // The refresh token no longer verifies (revoked, expired): the session is over.
    response_headers.append("Set-Cookie", serializeClearedSessionCookie(cookie.name, cookie.attrs));
  }
  return new Response(text, { status: upstream.status, headers: response_headers });
}

/**
 * The whoami session route (`GET`): the signed-in user, from the auth server's whoami
 * with the session's refresh token as a Bearer. In Next.js,
 * `app/auth/session/whoami/route.ts`:
 *
 * ```ts
 * export const { GET } = createAuthSessionWhoamiRoute();
 * ```
 */
export function createAuthSessionWhoamiRoute(
  options: AuthSessionRouteOptions = {},
): { GET: AuthSessionRouteHandler } {
  return { GET: createSessionRoute(options, handleWhoami) };
}

export default createAuthSessionWhoamiRoute;
