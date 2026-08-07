// Resolve the `next_href` search param (the page an unauthenticated
// user was trying to reach before the route guard bounced them to
// /auth/login) into a safe post-login redirect target.
//
// NOT server-only: the login form and MFA challenge view resolve the
// param client-side from `useSearchParams()`.

import { sanitizeNextHref } from "@schemavaults/auth-common";

// Destinations that are never useful to return to after logging in and
// could create redirect loops (the auth flow's own pages) or dead ends
// (the error page, the native-app close-window page).
function isDisallowedNextHrefDestination(path: string): boolean {
  return (
    path === "/auth" ||
    path.startsWith("/auth/") ||
    path === "/close_window" ||
    path.startsWith("/close_window/") ||
    path.startsWith("/close_window?") ||
    path === "/error" ||
    path.startsWith("/error/") ||
    path.startsWith("/error?")
  );
}

/**
 * @name resolveNextHref
 * @description Validate an untrusted `next_href` value (query param)
 * into a safe same-origin post-login redirect target for the auth
 * server. Returns `null` when the value is absent, unsafe (see
 * `sanitizeNextHref`), or points back into the auth flow itself —
 * callers should then fall back to the default `/account` destination.
 */
export function resolveNextHref(value: unknown): string | null {
  const sanitized: string | null = sanitizeNextHref(value);
  if (!sanitized) {
    return null;
  }
  if (isDisallowedNextHrefDestination(sanitized)) {
    return null;
  }
  return sanitized;
}

export default resolveNextHref;
