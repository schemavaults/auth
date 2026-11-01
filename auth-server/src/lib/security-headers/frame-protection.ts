/**
 * Clickjacking protection: no other site (not even a sibling subdomain) may
 * show an auth server page in a frame. The consent screen,
 * /account/connected-apps, /admin/* and the sign-in pages would otherwise be
 * open to UI redressing and credential phishing. The auth server never frames
 * its own pages either: OIDC flows use top-level redirects, not iframes.
 *
 * `next.config.ts` sends these headers on every response through its
 * `headers()` rules, so they apply to every deployment (Vercel, the
 * standalone Docker image, behind the `deploy/` nginx reverse proxy). This
 * module imports nothing so that `next.config.ts` can load it.
 */

/** CSP directive that refuses every framing origin (CSP Level 2). */
export const FRAME_ANCESTORS_NONE_DIRECTIVE = "frame-ancestors 'none'";

/**
 * Legacy equivalent of {@link FRAME_ANCESTORS_NONE_DIRECTIVE} for browsers
 * without CSP Level 2. Browsers that support `frame-ancestors` ignore it.
 */
export const X_FRAME_OPTIONS_DENY = "DENY";

/**
 * Top-level path segments whose route handlers send their own complete
 * `Content-Security-Policy`, which must include
 * {@link FRAME_ANCESTORS_NONE_DIRECTIVE}. The `next.config.ts` CSP rule leaves
 * them out because Next.js applies `next.config.ts` headers before the route
 * runs and then drops any header of the same name that the route handler
 * sets. A blanket rule would replace their stricter policy.
 *
 * - `branding`: `/branding/[asset]` sandboxes admin-uploaded SVG favicons.
 */
export const ROUTE_HANDLER_OWNED_CSP_SEGMENTS: readonly string[] = ["branding"];

/** Structural copy of Next.js's `Header` rule type (`next.config.ts` `headers()`). */
export interface NextConfigHeaderRule {
  source: string;
  headers: { key: string; value: string }[];
}

/**
 * The `headers()` rules of `next.config.ts` that forbid framing:
 * `X-Frame-Options: DENY` on every path, and
 * `Content-Security-Policy: frame-ancestors 'none'` on every path except the
 * {@link ROUTE_HANDLER_OWNED_CSP_SEGMENTS}.
 */
export function buildFrameProtectionHeaderRules(): NextConfigHeaderRule[] {
  const excluded_segments: string = ROUTE_HANDLER_OWNED_CSP_SEGMENTS.join("|");
  return [
    {
      // Not "/:path*": under Next.js's strict matching it misses "/".
      source: "/(.*)",
      headers: [{ key: "X-Frame-Options", value: X_FRAME_OPTIONS_DENY }],
    },
    {
      // Every path whose first segment is not one of the excluded ones.
      // path-to-regexp allows lookaheads inside a custom group.
      source: `/((?!(?:${excluded_segments})(?:/|$)).*)`,
      headers: [
        {
          key: "Content-Security-Policy",
          value: FRAME_ANCESTORS_NONE_DIRECTIVE,
        },
      ],
    },
  ];
}
