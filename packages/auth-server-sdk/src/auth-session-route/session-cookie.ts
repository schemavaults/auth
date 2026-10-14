import type { AppId } from "@schemavaults/app-definitions";

/**
 * Name of the HTTP-only cookie in which the hosting app's session routes
 * keep the refresh token, on the app's own host.
 *
 * Secure deployments use the `__Host-` prefix: browsers refuse such a cookie
 * unless it is `Secure`, has `Path=/` and has no `Domain` attribute. So no
 * other host can plant one for this host. Under `__Secure-` (or no prefix) a
 * sibling subdomain could set `Domain=<parent>; Path=/auth/session/token`,
 * and the browser would send that more specific cookie first, presenting an
 * attacker's refresh token (session fixation). Plain-HTTP development/test
 * deployments cannot use the prefix (it requires `Secure`).
 */
export function AuthSessionRefreshTokenCookieName(
  client_app_id: AppId,
  secure: boolean,
): string {
  return `${secure ? "__Host-" : ""}schemavaults_refresh_token_${client_app_id}`;
}

export interface SessionCookieAttributes {
  secure: boolean;
}

// `Path=/` and no `Domain` (host-only): what the `__Host-` prefix requires.
function attributes({ secure }: SessionCookieAttributes): string {
  return `; Path=/; HttpOnly; SameSite=Strict${secure ? "; Secure" : ""}`;
}

export function serializeSessionCookie(
  name: string,
  value: string,
  max_age_seconds: number,
  attrs: SessionCookieAttributes,
): string {
  return `${name}=${value}; Max-Age=${Math.max(0, Math.floor(max_age_seconds))}${attributes(attrs)}`;
}

export function serializeClearedSessionCookie(
  name: string,
  attrs: SessionCookieAttributes,
): string {
  return `${name}=; Max-Age=0${attributes(attrs)}`;
}

/**
 * The value of cookie `name` in a `Cookie` request header. Null when absent,
 * and also when the name appears more than once: the header carries no
 * attributes, so the route cannot tell its own cookie from a planted one and
 * must not guess.
 */
export function readCookie(cookie_header: string | null, name: string): string | null {
  if (!cookie_header) return null;
  let found: string | null = null;
  let count: number = 0;
  for (const pair of cookie_header.split(/;\s*/)) {
    const separator: number = pair.indexOf("=");
    if (separator > 0 && pair.slice(0, separator) === name) {
      count += 1;
      found = pair.slice(separator + 1);
    }
  }
  if (count !== 1 || !found) return null;
  return found;
}
