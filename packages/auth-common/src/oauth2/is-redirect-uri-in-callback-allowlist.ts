/**
 * Exact-match check of an OAuth2/OIDC `redirect_uri` against an app's
 * explicit callback-URL allowlist (RFC 6749 §3.1.2.3 simple string
 * comparison), with the one relaxation RFC 8252 §7.3 requires for
 * native apps: a registered loopback redirect URI matches regardless
 * of port.
 *
 * Both sides are parsed with `new URL()` and compared by serialized
 * href, which makes the comparison robust to purely-cosmetic encoding
 * differences (default ports, host casing, the mandatory trailing
 * slash on a bare origin) while still requiring the path, query, and
 * fragment-absence to match byte-for-byte.
 *
 * Loopback exception (RFC 8252 §7.3, OAuth 2.1 §8.4.2): a native app
 * (CLI, desktop, MCP client) listens on an ephemeral port it only knows
 * at runtime, so it cannot register the port up front. When the
 * *registered* URL is `http://127.0.0.1...` or `http://[::1]...`, the
 * presented URI is compared with its port ignored: scheme, loopback
 * host, path, and query must still match exactly. The relaxation is
 * decided by the registration, never by the presented URI, and never
 * applies to `localhost` (which may resolve off-box) or to non-`http`
 * schemes.
 *
 * An unparseable value on either side never matches.
 */

const LOOPBACK_HOSTNAMES: ReadonlySet<string> = new Set([
  "127.0.0.1",
  // `URL.hostname` keeps the brackets for IPv6 literals.
  "[::1]",
]);

/**
 * Whether a registered callback URL is a loopback-interface redirect URI
 * in the RFC 8252 §7.3 sense: `http` scheme and an IPv4 or IPv6
 * loopback IP literal as host (not `localhost`).
 */
export function isLoopbackRedirectUri(url: URL): boolean {
  return url.protocol === "http:" && LOOPBACK_HOSTNAMES.has(url.hostname);
}

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
    let registered: URL;
    try {
      registered = new URL(allowed);
    } catch {
      return false;
    }

    if (registered.href === presented.href) {
      return true;
    }

    // RFC 8252 §7.3: the port of a registered loopback redirect URI is
    // not significant. Rewrite the presented port to the registered one
    // and require everything else to match exactly. Only the loopback
    // host itself may differ in port; a different host, scheme, path,
    // or query still fails.
    if (
      isLoopbackRedirectUri(registered) &&
      presented.protocol === registered.protocol &&
      presented.hostname === registered.hostname
    ) {
      const presentedWithRegisteredPort = new URL(presented.href);
      presentedWithRegisteredPort.port = registered.port;
      return presentedWithRegisteredPort.href === registered.href;
    }

    return false;
  });
}

export default isRedirectUriInCallbackAllowlist;
