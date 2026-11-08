// NOT server-only: the header's client-side navigation reads these too.

/** One destination of the site's navigation (header, mobile menu, footer). */
export interface SiteLink {
  /** Stable id, used in `data-testid`s (`site-nav-<id>`, `site-menu-<id>`, `site-footer-<id>`). */
  id: string;
  href: string;
  label: string;
  /**
   * Path prefixes that mark this link as the current page. Defaults to
   * `href` itself (and the paths under it).
   */
  activePrefixes?: readonly string[];
}

/** The home page: every page links back to it. */
export const HOME_LINK: SiteLink = { id: "home", href: "/", label: "Home" };

/**
 * One link per demo, in the order the home page presents them. Labels stay
 * clear of the texts the E2E suite selects pages by (e.g. the API docs'
 * "Account" tag card, the home page's "Login" / "Register" buttons).
 */
export const DEMO_LINKS: readonly SiteLink[] = [
  {
    id: "sdk-sign-in",
    href: "/account",
    label: "SDK sign-in",
    activePrefixes: ["/account", "/auth/"],
  },
  {
    id: "openid-client",
    href: "/openid-client/profile",
    label: "openid-client",
    activePrefixes: ["/openid-client/"],
  },
  {
    id: "confidential-client",
    href: "/openid-client-confidential/profile",
    label: "Confidential client",
    activePrefixes: ["/openid-client-confidential/"],
  },
  { id: "agents", href: "/agents", label: "Agents" },
  { id: "api-docs", href: "/docs", label: "API docs" },
];

/** The header's links: home, then every demo. */
export const PRIMARY_NAV_LINKS: readonly SiteLink[] = [HOME_LINK, ...DEMO_LINKS];

/** Whether `link` is the page at `pathname` (or the section it belongs to). */
export function isSiteLinkActive(link: SiteLink, pathname: string): boolean {
  if (link.href === "/") return pathname === "/";
  const prefixes: readonly string[] = link.activePrefixes ?? [link.href];
  return prefixes.some(
    (prefix) =>
      pathname === prefix ||
      pathname === prefix.replace(/\/$/, "") ||
      pathname.startsWith(prefix.endsWith("/") ? prefix : `${prefix}/`),
  );
}
