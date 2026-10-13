import { serializeClearedSessionCookie } from "./session-cookie";
import {
  type AuthSessionRouteHandler,
  type AuthSessionRouteOptions,
  type SessionRouteRequest,
  authServerAppEndpoint,
  bearerHeaders,
  createSessionRoute,
  json,
} from "./session-route-context";

async function handleLogout({
  request,
  config,
  cookie,
  refresh_token,
  callAuthServer,
}: SessionRouteRequest): Promise<Response> {
  if (refresh_token) {
    // Revokes the refresh token and the access tokens minted with it.
    try {
      const upstream: Response = await callAuthServer(authServerAppEndpoint(config, "logout"), {
        method: "POST",
        headers: bearerHeaders(request, refresh_token),
      });
      if (!upstream.ok) {
        console.error(`[auth-session-route] The auth server answered the logout with HTTP ${upstream.status}`);
      }
    } catch (e: unknown) {
      console.error("[auth-session-route] Logout request to the auth server failed:", e);
    }
  }
  return json(
    200,
    { success: true, error: false, message: "Logged out" },
    { "Set-Cookie": serializeClearedSessionCookie(cookie.name, cookie.attrs) },
  );
}

/**
 * The logout session route (`POST`): revokes the session at the auth server (best
 * effort) and clears the session cookie. In Next.js,
 * `app/auth/session/logout/route.ts`:
 *
 * ```ts
 * export const { POST } = createAuthSessionLogoutRoute();
 * ```
 */
export function createAuthSessionLogoutRoute(
  options: AuthSessionRouteOptions = {},
): { POST: AuthSessionRouteHandler } {
  return { POST: createSessionRoute(options, handleLogout) };
}

export default createAuthSessionLogoutRoute;
