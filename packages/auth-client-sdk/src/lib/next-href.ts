// The `next_href` search param carries the page a user was trying to reach
// when a route guard sent them to sign in (`/auth/login?next_href=/admin`),
// so the sign-in flow can return them there. `@schemavaults/auth-server-sdk`'s
// server component route guards and the react provider's client middleware
// add it; the login / register pages hand it to `login()` / `register()`,
// which keep it across the auth server round trip.

import { sanitizeNextHref } from "@schemavaults/auth-common";

/** The search param a route guard forwards the attempted page in. */
export const NEXT_HREF_SEARCH_PARAM = "next_href" as const;

// The sign-in flow's own pages (codegen serves them all under `/auth`:
// login, register, authorize, logout, error) are never a useful place to
// return to and could loop the user through the flow again.
function isAuthFlowPath(path: string): boolean {
  const pathname: string = path.split(/[?#]/, 1)[0] ?? path;
  return pathname === "/auth" || pathname.startsWith("/auth/");
}

/**
 * @name resolveNextHref
 * @description Validate an untrusted `next_href` value into a safe
 * same-origin post-sign-in destination. Returns `null` when the value is
 * absent, unsafe (see `sanitizeNextHref` in `@schemavaults/auth-common`), or
 * points back into the sign-in flow (`/auth/*`); callers then fall back to
 * their default destination.
 */
export function resolveNextHref(value: unknown): string | null {
  const sanitized: string | null = sanitizeNextHref(value);
  if (!sanitized || isAuthFlowPath(sanitized)) {
    return null;
  }
  return sanitized;
}

/**
 * @name withNextHref
 * @description Add `next_href` to a same-origin URL (e.g. the login page),
 * keeping the URL's other search params and hash. `url` is returned
 * unchanged when `next_href` does not resolve (see {@link resolveNextHref}).
 * @example withNextHref("/auth/login", "/admin/keys") // "/auth/login?next_href=%2Fadmin%2Fkeys"
 */
export function withNextHref(url: string, next_href: unknown): string {
  const resolved: string | null = resolveNextHref(next_href);
  if (!resolved) {
    return url;
  }
  const hash_index: number = url.indexOf("#");
  const before_hash: string = hash_index === -1 ? url : url.slice(0, hash_index);
  const hash: string = hash_index === -1 ? "" : url.slice(hash_index);
  const query_index: number = before_hash.indexOf("?");
  const path: string =
    query_index === -1 ? before_hash : before_hash.slice(0, query_index);
  const params = new URLSearchParams(
    query_index === -1 ? "" : before_hash.slice(query_index + 1),
  );
  params.set(NEXT_HREF_SEARCH_PARAM, resolved);
  return `${path}?${params.toString()}${hash}`;
}
