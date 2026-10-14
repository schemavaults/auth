/**
 * The hosting app's same-origin auth session routes, one URL (or path) per
 * route. Served by the route factories of
 * `@schemavaults/auth-server-sdk/auth-session-route`, which keep the refresh
 * token in an HTTP-only cookie on the app's own domain.
 */
export interface AuthSessionRoutes {
  /** `POST`: the authorization code and refresh grants (in place of the auth server's token endpoint). */
  token: string;
  /** `GET`: the signed-in user (in place of the auth server's whoami). */
  whoami: string;
  /** `POST`: revokes the session at the auth server and clears its cookie. */
  logout: string;
}
