import type { MetadataRoute } from "next";
import type { SchemaVaultsAppEnvironment } from "@schemavaults/app-definitions";

/** Where the sitemap is served from (src/app/sitemap.ts). */
export const SITEMAP_PATH = "/sitemap.xml" as const;

/**
 * Pages anyone can open signed out. /sitemap.xml lists them, followed by
 * one /docs/<slug> page per API operation.
 */
export const PUBLIC_PAGE_PATHS = [
  "/",
  "/auth/login",
  "/auth/register",
  "/help",
  "/docs",
] as const;

/**
 * Path prefixes a production robots.txt asks crawlers to skip: the JSON API,
 * the signed-in dashboard (every page under src/app/(client)/(authenticated)/,
 * plus the legacy /org/* redirects), auth flow steps that only make sense
 * mid-flow, and login / register URLs carrying a client app's authorization
 * request (the bare pages stay crawlable).
 */
export const CRAWLER_DISALLOWED_PATH_PREFIXES = [
  "/api/",
  "/account",
  "/admin",
  "/apis",
  "/apps",
  "/mfa",
  "/orgs",
  "/org/",
  "/auth/login?",
  "/auth/register?",
  "/auth/logout",
  "/auth/mfa",
  "/auth/reset-password",
  "/auth/verify-email",
  "/close_window",
  "/error",
] as const;

function absoluteUrl(auth_server_url: string, path: string): string {
  return new URL(path, auth_server_url).toString();
}

/**
 * Sitemap entries for the given page paths, as absolute URLs on the
 * deployment's own (possibly white-label) auth server URL.
 */
export function buildAuthServerSitemap(options: {
  auth_server_url: string;
  paths: readonly string[];
}): MetadataRoute.Sitemap {
  return options.paths.map((path) => ({
    url: absoluteUrl(options.auth_server_url, path),
  }));
}

/**
 * robots.txt rules. Production lets crawlers in (minus the
 * CRAWLER_DISALLOWED_PATH_PREFIXES) and points them at the sitemap; every
 * other environment keeps them out entirely, so development, staging and
 * test deployments never show up in search results.
 */
export function buildAuthServerRobots(options: {
  auth_server_url: string;
  environment: SchemaVaultsAppEnvironment;
}): MetadataRoute.Robots {
  if (options.environment !== "production") {
    return { rules: { userAgent: "*", disallow: "/" } };
  }
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [...CRAWLER_DISALLOWED_PATH_PREFIXES],
    },
    sitemap: absoluteUrl(options.auth_server_url, SITEMAP_PATH),
  };
}
