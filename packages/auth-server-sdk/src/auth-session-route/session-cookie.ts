import type { AppId } from "@schemavaults/app-definitions";

/**
 * Name of the HTTP-only cookie in which the hosting app's session route
 * keeps the refresh token, on the app's own domain. The `__Secure-` prefix
 * (secure deployments) makes browsers refuse the cookie unless it was set
 * over HTTPS with `Secure`.
 */
export function AuthSessionRefreshTokenCookieName(
  client_app_id: AppId,
  secure: boolean,
): string {
  return `${secure ? "__Secure-" : ""}schemavaults_refresh_token_${client_app_id}`;
}

export interface SessionCookieAttributes {
  /** The session route's own path (the cookie is sent to it only). */
  path: string;
  secure: boolean;
}

function attributes({ path, secure }: SessionCookieAttributes): string {
  return `; Path=${path}; HttpOnly; SameSite=Strict${secure ? "; Secure" : ""}`;
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

/** The value of cookie `name` in a `Cookie` request header, if present. */
export function readCookie(cookie_header: string | null, name: string): string | null {
  if (!cookie_header) return null;
  for (const pair of cookie_header.split(/;\s*/)) {
    const separator: number = pair.indexOf("=");
    if (separator > 0 && pair.slice(0, separator) === name) {
      const value: string = pair.slice(separator + 1);
      return value.length > 0 ? value : null;
    }
  }
  return null;
}
