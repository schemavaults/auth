import { describe, expect, test } from "bun:test";
// The matcher the Next.js server evaluates `next.config.ts` header `source`s
// with (server/lib/router-utils/filesystem.js `buildCustomRoute`).
import { modifyRouteRegex } from "next/dist/lib/redirect-status";
import { getPathMatch } from "next/dist/shared/lib/router/utils/path-match";
import {
  buildFrameProtectionHeaderRules,
  FRAME_ANCESTORS_NONE_DIRECTIVE,
  ROUTE_HANDLER_OWNED_CSP_SEGMENTS,
  X_FRAME_OPTIONS_DENY,
} from "./frame-protection";

/** The headers `next.config.ts` adds to a request for `pathname`. */
function headersFor(pathname: string): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const rule of buildFrameProtectionHeaderRules()) {
    const match = getPathMatch(rule.source, {
      strict: true,
      removeUnnamedParams: true,
      regexModifier: (regex: string) => modifyRouteRegex(regex),
    });
    if (match(pathname) !== false) {
      for (const { key, value } of rule.headers) {
        headers[key] = value;
      }
    }
  }
  return headers;
}

const FRAMEABLE_LOOKING_PATHS: readonly string[] = [
  "/",
  "/auth/login",
  "/auth/consent",
  "/auth/verify-email/required",
  "/account/connected-apps",
  "/admin",
  "/admin/",
  "/admin/users/0b6a1c1e-7f0e-4c43-9a4e-6d1b0a6c9f11",
  "/orgs/new",
  "/mfa",
  "/docs",
  "/docs/get-api-openapi-json",
  "/api/openapi.json",
  "/api/oidc/authorize",
  "/.well-known/openid-configuration",
  "/does-not-exist",
  // Only the exact `branding` segment is route-owned.
  "/branding-guidelines",
  "/brandingx/favicon",
  "/admin/branding",
];

describe("frame protection headers", () => {
  test.each(FRAMEABLE_LOOKING_PATHS)(
    "%s forbids framing with CSP frame-ancestors and X-Frame-Options",
    (pathname) => {
      expect(headersFor(pathname)).toEqual({
        "X-Frame-Options": X_FRAME_OPTIONS_DENY,
        "Content-Security-Policy": FRAME_ANCESTORS_NONE_DIRECTIVE,
      });
    },
  );

  test.each([
    "/branding/favicon",
    "/branding/icon",
    "/branding/opengraph",
    "/branding/",
  ])(
    "%s keeps its route handler's own CSP but still gets X-Frame-Options",
    (pathname) => {
      expect(headersFor(pathname)).toEqual({
        "X-Frame-Options": X_FRAME_OPTIONS_DENY,
      });
    },
  );

  test("the directive refuses every framing origin", () => {
    expect(FRAME_ANCESTORS_NONE_DIRECTIVE).toBe("frame-ancestors 'none'");
    expect(X_FRAME_OPTIONS_DENY).toBe("DENY");
  });

  test("route-owned CSP segments are single path segments", () => {
    for (const segment of ROUTE_HANDLER_OWNED_CSP_SEGMENTS) {
      expect(segment).toMatch(/^[a-z0-9-]+$/);
    }
  });
});
