/**
 * Exact-match check of an OAuth2/OIDC `redirect_uri` against an app's
 * explicit callback-URL allowlist (RFC 6749 §3.1.2.3 simple string
 * comparison).
 *
 * Both sides are parsed with `new URL()` and compared by serialized
 * href, which makes the comparison robust to purely-cosmetic encoding
 * differences (default ports, host casing, the mandatory trailing
 * slash on a bare origin) while still requiring the path, query, and
 * fragment-absence to match byte-for-byte.
 *
 * An unparseable value on either side never matches.
 */
export function isRedirectUriInCallbackAllowlist(
  redirect_uri: string,
  allowedCallbackUrls: readonly string[],
): boolean {
  if (typeof redirect_uri !== "string" || redirect_uri.length === 0) {
    return false;
  }

  let presented: URL;
  try {
    presented = new URL(redirect_uri);
  } catch {
    return false;
  }

  return allowedCallbackUrls.some((allowed) => {
    try {
      return new URL(allowed).href === presented.href;
    } catch {
      return false;
    }
  });
}

export default isRedirectUriInCallbackAllowlist;
