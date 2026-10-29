import { describe, expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import path from "node:path";
import type { MetadataRoute } from "next";
import {
  buildAuthServerRobots,
  buildAuthServerSitemap,
  CRAWLER_DISALLOWED_PATH_PREFIXES,
  PUBLIC_PAGE_PATHS,
} from "./crawler-policy";

const APP_DIR = path.resolve(import.meta.dir, "../../app");
const AUTH_SERVER_URL = "https://auth.example.com";

const productionRobots: MetadataRoute.Robots = buildAuthServerRobots({
  auth_server_url: AUTH_SERVER_URL,
  environment: "production",
});

function asList(value: string | string[] | undefined): string[] {
  return value === undefined ? [] : Array.isArray(value) ? value : [value];
}

/**
 * Whether the robots rules let a crawler fetch `pathAndQuery` (RFC 9309
 * §2.2.2: the longest matching path prefix wins, Allow on a tie).
 */
function isCrawlable(robots: MetadataRoute.Robots, pathAndQuery: string): boolean {
  const rules = Array.isArray(robots.rules) ? robots.rules : [robots.rules];
  let longestAllow = -1;
  let longestDisallow = -1;
  for (const rule of rules) {
    for (const prefix of asList(rule.allow)) {
      if (pathAndQuery.startsWith(prefix)) longestAllow = Math.max(longestAllow, prefix.length);
    }
    for (const prefix of asList(rule.disallow)) {
      if (pathAndQuery.startsWith(prefix)) longestDisallow = Math.max(longestDisallow, prefix.length);
    }
  }
  return longestAllow >= longestDisallow;
}

interface AppPage {
  /** URL path, route groups dropped, dynamic segments left as `[name]`. */
  route: string;
  /** Route groups the page sits in, e.g. `(authenticated)`. */
  groups: string[];
}

/** Every page.tsx under src/app, as the URL path Next.js serves it at. */
function collectAppPages(dir: string = APP_DIR, segments: string[] = [], groups: string[] = []): AppPage[] {
  const pages: AppPage[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isFile() && entry.name === "page.tsx") {
      pages.push({ route: `/${segments.join("/")}`, groups });
    } else if (entry.isDirectory() && !entry.name.startsWith("_")) {
      const child = path.join(dir, entry.name);
      if (entry.name.startsWith("(") && entry.name.endsWith(")")) {
        pages.push(...collectAppPages(child, segments, [...groups, entry.name]));
      } else {
        pages.push(...collectAppPages(child, [...segments, entry.name], groups));
      }
    }
  }
  return pages;
}

describe("buildAuthServerSitemap", () => {
  test("lists each path as an absolute URL on the deployment's own origin", () => {
    expect(
      buildAuthServerSitemap({ auth_server_url: "https://id.acme.test", paths: ["/", "/docs/get-api-health"] }),
    ).toEqual([{ url: "https://id.acme.test/" }, { url: "https://id.acme.test/docs/get-api-health" }]);
  });
});

describe("buildAuthServerRobots", () => {
  test("production allows crawling, minus the private prefixes, and links the sitemap", () => {
    expect(productionRobots).toEqual({
      rules: { userAgent: "*", allow: "/", disallow: [...CRAWLER_DISALLOWED_PATH_PREFIXES] },
      sitemap: "https://auth.example.com/sitemap.xml",
    });
  });

  test("every other environment keeps crawlers out entirely", () => {
    for (const environment of ["development", "staging", "test"] as const) {
      const robots = buildAuthServerRobots({ auth_server_url: AUTH_SERVER_URL, environment });
      expect(robots, environment).toEqual({ rules: { userAgent: "*", disallow: "/" } });
      expect(isCrawlable(robots, "/"), environment).toBe(false);
    }
  });
});

describe("the crawler policy matches the app's pages", () => {
  const pages: AppPage[] = collectAppPages();

  test("every public page exists and is crawlable in production", () => {
    const routes = new Set(pages.map((page) => page.route));
    for (const publicPath of PUBLIC_PAGE_PATHS) {
      expect(routes.has(publicPath), `${publicPath} has a page.tsx`).toBe(true);
      expect(isCrawlable(productionRobots, publicPath), publicPath).toBe(true);
    }
  });

  test("every signed-in dashboard page is disallowed in production", () => {
    const dashboardPages = pages.filter((page) => page.groups.includes("(authenticated)"));
    expect(dashboardPages.length).toBeGreaterThan(0);
    for (const page of dashboardPages) {
      expect(isCrawlable(productionRobots, page.route), page.route).toBe(false);
    }
  });

  test("login and register links carrying a client app's authorization request are disallowed", () => {
    expect(isCrawlable(productionRobots, "/auth/login?app_id=acme&redirect_uri=https%3A%2F%2Facme.test")).toBe(false);
    expect(isCrawlable(productionRobots, "/auth/register?app_id=acme")).toBe(false);
    expect(isCrawlable(productionRobots, "/api/openapi.json")).toBe(false);
    expect(isCrawlable(productionRobots, "/branding/opengraph-image?v=abc")).toBe(true);
  });
});
