// format-redirect-destination.ts
//
// Human-readable destination label for the app authorization consent
// screen. A client app's `app_name` / `app_description` are supplied by
// whoever registered the app — with dynamic client registration those
// strings are attacker-controlled — so the consent screen must also show
// the user something the registrant cannot freely invent: the host the
// browser will actually be sent to. The `redirect_uri` has already been
// checked against the app's registered callback allowlist by the time
// the consent screen renders, so its host is a trustworthy signal of
// which site is asking for access.
//
// Shared by client components (no `server-only` import here).

/**
 * Format the `redirect_uri` of an authorization flow as a short label
 * naming where the user will land after authorizing.
 *
 * - `http(s)` URIs render as `host` (hostname plus a non-default port),
 *   e.g. `app.example.com` or `localhost:3007`.
 * - Other schemes (custom native-app schemes) keep the scheme so the
 *   user can tell it is not a website, e.g. `myapp://callback`.
 * - Returns `null` for an absent, empty, unparsable, or host-less URI.
 */
export function formatRedirectDestination(
  redirect_uri: string | null | undefined,
): string | null {
  if (typeof redirect_uri !== "string" || redirect_uri.length === 0) {
    return null;
  }
  let url: URL;
  try {
    url = new URL(redirect_uri);
  } catch {
    return null;
  }
  if (url.host.length === 0) {
    return null;
  }
  if (url.protocol === "http:" || url.protocol === "https:") {
    return url.host;
  }
  return `${url.protocol}//${url.host}`;
}

export default formatRedirectDestination;
