import { afterEach, describe, expect, test } from "bun:test";
import { PUBLIC_PAGE_PATHS } from "@/lib/seo/crawler-policy";

const ORIGINAL_ENV = {
  SCHEMAVAULTS_AUTH_SERVER_URL: process.env.SCHEMAVAULTS_AUTH_SERVER_URL,
  SCHEMAVAULTS_APP_ENVIRONMENT: process.env.SCHEMAVAULTS_APP_ENVIRONMENT,
};
afterEach(() => {
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("GET /sitemap.xml", () => {
  test("lists the public pages, then one API reference page per catalogued operation, on the deployment's URL", async () => {
    const { default: sitemap } = await import("./sitemap");
    const { operations } = await import("@/lib/api/operations");
    process.env.SCHEMAVAULTS_AUTH_SERVER_URL = "https://id.acme.test";

    const urls: string[] = sitemap().map((entry) => entry.url);
    expect(urls.slice(0, PUBLIC_PAGE_PATHS.length)).toEqual(
      PUBLIC_PAGE_PATHS.map((path) => new URL(path, "https://id.acme.test").toString()),
    );
    const docsUrls: string[] = urls.slice(PUBLIC_PAGE_PATHS.length);
    expect(docsUrls.length).toBe(operations.length);
    expect(new Set(urls).size).toBe(urls.length);
    for (const url of docsUrls) {
      expect(url).toStartWith("https://id.acme.test/docs/");
    }
    expect(docsUrls).toContain("https://id.acme.test/docs/get-api-config-app-id");
  });
});

describe("GET /robots.txt", () => {
  test("points production crawlers at the deployment's own sitemap", async () => {
    const { default: robots } = await import("./robots");
    process.env.SCHEMAVAULTS_APP_ENVIRONMENT = "production";
    process.env.SCHEMAVAULTS_AUTH_SERVER_URL = "https://id.acme.test";
    expect(robots().sitemap).toBe("https://id.acme.test/sitemap.xml");

    process.env.SCHEMAVAULTS_APP_ENVIRONMENT = "staging";
    process.env.SCHEMAVAULTS_AUTH_SERVER_URL = "https://auth-staging.acme.test";
    expect(robots()).toEqual({ rules: { userAgent: "*", disallow: "/" } });
  });
});
