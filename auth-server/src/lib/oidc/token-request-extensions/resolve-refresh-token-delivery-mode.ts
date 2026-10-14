import "server-only";
import type { AppId } from "@schemavaults/app-definitions";
import type { OidcRefreshTokenDeliveryMode } from "@schemavaults/auth-common";
import getAuthServerAppId from "@/lib/config/auth-server-app-id";

/**
 * Decides how the refresh token leaves the token endpoint. This is the
 * platform's long-standing cookie policy:
 *
 *   - the auth server's own frontend ALWAYS gets an HTTP-only cookie
 *     (its server-rendered route guards read the cookie);
 *   - a refresh grant that presented its refresh token as the app's
 *     HTTP-only cookie gets the rotated token back in the cookie, whatever
 *     it requested: answering inline would hand a script on the client's
 *     page (which can make the browser send the cookie, but never read it)
 *     the refresh token the cookie exists to keep from it;
 *   - other clients get a cookie only when they ask for one AND the
 *     deployment is secure (cross-site cookies require `SameSite=None;
 *     Secure`, which plain-HTTP dev/test deployments cannot set), else
 *     the token is inlined per RFC 6749 §5.1.
 */
export function resolveRefreshTokenDeliveryMode(
  client_app_id: AppId,
  requested: OidcRefreshTokenDeliveryMode,
  secure: boolean,
  presented_via_cookie: boolean = false,
): OidcRefreshTokenDeliveryMode {
  if (client_app_id === getAuthServerAppId()) {
    return "http_only_cookie";
  }
  if (presented_via_cookie) {
    return "http_only_cookie";
  }
  if (requested === "http_only_cookie" && secure) {
    return "http_only_cookie";
  }
  return "inline";
}

export default resolveRefreshTokenDeliveryMode;
