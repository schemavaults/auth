// Whether the page and the auth server are the same site, i.e. whether the
// auth server's HTTP-only refresh-token cookie would be a first-party cookie.
//
// The token endpoint sets that cookie on the AUTH SERVER's host in answer to
// a credentialed fetch from the page. When the two are different sites
// ("lorahworld.jalexw.ca" and "auth.schemavaults.com") it is a third-party
// cookie, and browsers that block third-party cookies drop it: Safari and
// every iOS browser (all WebKit) by default, Brave, Chrome's incognito mode.
// The code exchange still succeeds, but the session is lost the moment the
// SDK reads it back. Same-site pages ("app.schemavaults.com") are unaffected.
//
// Sites are compared the way browsers do (RFC 6265bis "same-site"): same
// scheme and same registrable domain (eTLD+1). The registrable domain needs
// the Public Suffix List, which browsers expose only indirectly: they refuse
// a cookie whose Domain attribute is a public suffix ("ca", "co.uk",
// "github.io"). The shortest suffix of the page's host that accepts a cookie
// is therefore its registrable domain.

/** Answers whether the browser accepts a cookie with `Domain=<domain>` from this page. */
export type CookieDomainProbe = (domain: string) => boolean;

export interface PageLocation {
  /** e.g. "https:" */
  protocol: string;
  /** e.g. "lorahworld.jalexw.ca" (no port) */
  hostname: string;
}

const IPV4_PATTERN: RegExp = /^\d{1,3}(\.\d{1,3}){3}$/;

function normalizeHostname(hostname: string): string {
  return hostname.toLowerCase().replace(/\.$/, "");
}

/** IP literals and single-label hosts (localhost) have no registrable domain. */
function hasRegistrableDomain(hostname: string): boolean {
  if (hostname.includes(":") || hostname.startsWith("[")) return false; // IPv6
  if (IPV4_PATTERN.test(hostname)) return false;
  return hostname.includes(".");
}

/**
 * The registrable domain (eTLD+1) of `hostname`: the shortest of its
 * suffixes (two labels or more) that the browser accepts as a cookie
 * Domain. `null` when it has none (IP literals, single-label hosts) or the
 * browser accepts no cookie at all (cookies disabled).
 */
export function findRegistrableDomain(
  hostname: string,
  canSetCookieOnDomain: CookieDomainProbe,
): string | null {
  const host: string = normalizeHostname(hostname);
  if (!hasRegistrableDomain(host)) return null;
  const labels: string[] = host.split(".");
  for (let start = labels.length - 2; start >= 0; start--) {
    const candidate: string = labels.slice(start).join(".");
    if (canSetCookieOnDomain(candidate)) return candidate;
  }
  return null;
}

/**
 * Whether `page` and `auth_server_url` are the same site. Errs towards
 * "cross-site" when it cannot tell (unparseable URL, cookies disabled).
 */
export function isSameSiteAsAuthServer(
  page: PageLocation,
  auth_server_url: string,
  canSetCookieOnDomain: CookieDomainProbe,
): boolean {
  let auth_server: URL;
  try {
    auth_server = new URL(auth_server_url);
  } catch {
    return false;
  }
  if (auth_server.protocol !== page.protocol) return false;

  const page_host: string = normalizeHostname(page.hostname);
  const auth_host: string = normalizeHostname(auth_server.hostname);
  if (page_host === auth_host) return true;

  const site: string | null = findRegistrableDomain(page_host, canSetCookieOnDomain);
  if (site === null) return false;
  return auth_host === site || auth_host.endsWith(`.${site}`);
}

const PROBE_COOKIE_NAME: string = "__schemavaults_site_probe";

/**
 * {@link CookieDomainProbe} for the current document: sets a throwaway
 * cookie on `domain`, checks it stuck, and deletes it again.
 */
export function documentCookieDomainProbe(domain: string): boolean {
  try {
    const value: string = Math.random().toString(36).slice(2);
    const attributes: string = `; domain=${domain}; path=/; SameSite=Lax`;
    document.cookie = `${PROBE_COOKIE_NAME}=${value}${attributes}`;
    const accepted: boolean = document.cookie
      .split(/;\s*/)
      .includes(`${PROBE_COOKIE_NAME}=${value}`);
    document.cookie = `${PROBE_COOKIE_NAME}=${attributes}; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
    return accepted;
  } catch {
    return false;
  }
}
