// The `next_href` parameter carries the URL a user was trying to reach
// when an auth route guard bounced them to the login page, so that the
// post-login redirect can return them to it. Because the value round-trips
// through a user-controlled query string, it is an open-redirect vector
// unless it is strictly confined to a same-origin path.
//
// This sanitizer accepts only an absolute-path reference (RFC 3986
// §4.2: begins with "/" but not "//") and returns the normalized
// `pathname + search + hash`. Everything else — absolute URLs,
// protocol-relative URLs ("//evil.example"), backslash variants
// ("/\evil.example", which browsers treat as "//"), control characters,
// or values a URL parser resolves off-origin — is rejected with `null`
// so callers can fall back to their default destination.

/**
 * Maximum accepted `next_href` length. Generous enough for deep paths
 * with query strings while keeping the value log- and cookie-safe.
 */
export const MAX_NEXT_HREF_LENGTH = 2048 as const;

// Sentinel base origin used to resolve the candidate path. If the
// parsed result escapes this origin, the value was not a plain path.
const SANITIZE_BASE_ORIGIN = "https://next-href.invalid" as const;

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS_REGEX: RegExp = /[\u0000-\u001f\u007f]/;

/**
 * @name sanitizeNextHref
 * @description Validate a post-login redirect target from an untrusted
 * source (query param, form field). Returns the normalized same-origin
 * path (`pathname + search + hash`) when the value is a safe internal
 * absolute-path reference, or `null` when it is absent or unsafe.
 * Callers should treat `null` as "use the default destination".
 */
export function sanitizeNextHref(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  if (value.length === 0 || value.length > MAX_NEXT_HREF_LENGTH) {
    return null;
  }
  // Must be an absolute-path reference: "/..." but never "//..." (a
  // protocol-relative URL) nor "/\..." (browser-normalized to "//").
  if (!value.startsWith("/")) {
    return null;
  }
  if (value.startsWith("//") || value.startsWith("/\\")) {
    return null;
  }
  if (CONTROL_CHARS_REGEX.test(value)) {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(value, SANITIZE_BASE_ORIGIN);
  } catch {
    return null;
  }

  // A plain path resolved against the sentinel base must stay on the
  // sentinel origin; anything else smuggled in a scheme or authority.
  if (parsed.origin !== SANITIZE_BASE_ORIGIN) {
    return null;
  }
  // Defense-in-depth: reject if normalization still yields a
  // protocol-relative shape (e.g. via backslash tricks the guards
  // above didn't anticipate).
  if (parsed.pathname.startsWith("//")) {
    return null;
  }

  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

export default sanitizeNextHref;
