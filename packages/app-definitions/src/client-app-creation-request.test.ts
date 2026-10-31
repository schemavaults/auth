import { describe, expect, test } from "bun:test";
import {
  canonicalAppDomain,
  isHttpOriginUrl,
  MAX_INITIAL_APP_CALLBACK_URLS,
  schemaVaultsAppCreationRequestSchema,
} from "./client-app-creation-request";

const APP = {
  app_id: "my-app",
  app_name: "My App",
  app_description: "",
  created_at: 1,
  public: false,
  hardcoded: false,
  web: true,
} as const;

describe("isHttpOriginUrl", () => {
  test("accepts http(s) origins, with a port or a trailing slash", () => {
    expect(isHttpOriginUrl("https://app.example.com")).toBe(true);
    expect(isHttpOriginUrl("https://app.example.com/")).toBe(true);
    expect(isHttpOriginUrl("http://localhost:3000")).toBe(true);
    expect(isHttpOriginUrl("https://App.Example.com:443")).toBe(true);
  });

  test("refuses paths, queries, fragments, credentials and other schemes", () => {
    expect(isHttpOriginUrl("app.example.com")).toBe(false);
    expect(isHttpOriginUrl("https://app.example.com/callback")).toBe(false);
    expect(isHttpOriginUrl("https://app.example.com/?")).toBe(false);
    expect(isHttpOriginUrl("https://app.example.com?a=1")).toBe(false);
    expect(isHttpOriginUrl("https://app.example.com#x")).toBe(false);
    expect(isHttpOriginUrl("https://user@app.example.com")).toBe(false);
    expect(isHttpOriginUrl("com.example.app:/callback")).toBe(false);
  });
});

describe("canonicalAppDomain", () => {
  test("lowercases the host and drops a default port and trailing slash", () => {
    expect(canonicalAppDomain("https://App.Example.com:443/")).toBe("https://app.example.com");
    expect(canonicalAppDomain("http://localhost:3000")).toBe("http://localhost:3000");
    expect(canonicalAppDomain("not a url")).toBe("not a url");
  });
});

describe("schemaVaultsAppCreationRequestSchema", () => {
  test("accepts a bare app definition (domains and callback URLs are optional)", () => {
    expect(schemaVaultsAppCreationRequestSchema.safeParse(APP).success).toBe(true);
  });

  test("accepts initial domains and callback URLs", () => {
    const parsed = schemaVaultsAppCreationRequestSchema.safeParse({
      ...APP,
      initial_domains: [
        { domain: "https://app.example.com", environment: "production" },
        { domain: "http://localhost:3000", environment: "development" },
      ],
      initial_callback_urls: [
        { callback_url: "https://app.example.com/auth/callback", environment: "production" },
        { callback_url: "https://app.example.com/auth/callback", environment: "development" },
        { callback_url: "com.example.app:/oauth2redirect", environment: "production" },
      ],
    });
    expect(parsed.success).toBe(true);
  });

  test("refuses a domain that is not an origin", () => {
    const parsed = schemaVaultsAppCreationRequestSchema.safeParse({
      ...APP,
      initial_domains: [{ domain: "https://app.example.com/path", environment: "test" }],
    });
    expect(parsed.success).toBe(false);
  });

  test("refuses a callback URL with a fragment", () => {
    const parsed = schemaVaultsAppCreationRequestSchema.safeParse({
      ...APP,
      initial_callback_urls: [{ callback_url: "https://app.example.com/cb#x", environment: "test" }],
    });
    expect(parsed.success).toBe(false);
  });

  test("refuses duplicates within one environment", () => {
    const domains = schemaVaultsAppCreationRequestSchema.safeParse({
      ...APP,
      initial_domains: [
        { domain: "https://app.example.com", environment: "test" },
        { domain: "https://APP.example.com:443/", environment: "test" },
      ],
    });
    expect(domains.success).toBe(false);
    expect(domains.error?.issues[0]?.path).toEqual(["initial_domains", 1]);

    const callbacks = schemaVaultsAppCreationRequestSchema.safeParse({
      ...APP,
      initial_callback_urls: [
        { callback_url: "https://app.example.com/cb", environment: "test" },
        { callback_url: "https://app.example.com/cb", environment: "test" },
      ],
    });
    expect(callbacks.success).toBe(false);
    expect(callbacks.error?.issues[0]?.path).toEqual(["initial_callback_urls", 1]);
  });

  test("caps the number of callback URLs", () => {
    const parsed = schemaVaultsAppCreationRequestSchema.safeParse({
      ...APP,
      initial_callback_urls: Array.from(
        { length: MAX_INITIAL_APP_CALLBACK_URLS + 1 },
        (_, i) => ({ callback_url: `https://app.example.com/cb/${i}`, environment: "test" }),
      ),
    });
    expect(parsed.success).toBe(false);
  });

  test("stays strict: unknown keys are refused", () => {
    expect(
      schemaVaultsAppCreationRequestSchema.safeParse({ ...APP, callback_urls: [] }).success,
    ).toBe(false);
  });
});
