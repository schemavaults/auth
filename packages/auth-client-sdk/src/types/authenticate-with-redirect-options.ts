import type { AuthorizationParams } from "@/types/authorization-params";

/**
 * Options of `login()` / `register()`: the authorization request the SDK
 * redirects to the auth server with. `scope` and `resource` each fall back to
 * the client's `authorization_params` when the call leaves them out.
 */
export interface AuthenticateWithRedirectOptions extends AuthorizationParams {
  /**
   * Same-origin path (e.g. `/admin/keys?tab=scopes`) to return the user to
   * once the flow completes, instead of the client's
   * `successful_authentication_redirect_uri`: usually the `next_href` search
   * param a route guard sent the user to the login page with. Kept across
   * the auth server round trip; read it back on the authorize page with
   * `consumeNextHref()`. Values that are not same-origin paths, or that
   * point into the sign-in flow (`/auth/*`), are dropped.
   */
  next_href?: string;
}
