import { describe, test, expect } from "bun:test";
import { z } from "zod";
import {
  createAudienceListSchema,
  createAudienceSchema,
  createResourceUrlAudienceSchema,
  isResourceUrlAudience,
} from "./audience-schema";

const AUTH_SERVER_URL = "https://auth.example-white-label.com";
const AUTH_SERVER_APP_ID = "example-auth";
const ENVIRONMENT = "development" as const;
const OVERRIDES = {
  auth_server_url: AUTH_SERVER_URL,
  auth_server_app_id: AUTH_SERVER_APP_ID,
} as const;

describe("createAudienceListSchema", () => {
  const schema = createAudienceListSchema(z, ENVIRONMENT, OVERRIDES);

  test("accepts an empty array (call sites enforce non-emptiness)", () => {
    expect(schema.safeParse([]).success).toBe(true);
  });

  test("accepts a list of valid audiences", () => {
    expect(schema.safeParse(["some-api", AUTH_SERVER_URL]).success).toBe(true);
  });

  test("rejects a list containing an invalid audience", () => {
    expect(schema.safeParse(["not a valid audience ref!!"]).success).toBe(
      false,
    );
  });

  test("rejects a bare string", () => {
    expect(schema.safeParse("some-api").success).toBe(false);
  });

  test("rejects a list with more than 10 audiences", () => {
    const audiences = Array.from({ length: 11 }, (_, i) => `api-server-${i}`);
    expect(schema.safeParse(audiences).success).toBe(false);
  });

  test("rejects the auth server's own app id as an audience", () => {
    expect(schema.safeParse([AUTH_SERVER_APP_ID]).success).toBe(false);
  });
});

describe("resource URL audiences (RFC 8707)", () => {
  const overrides = {
    auth_server_url: "https://auth.example.com",
    auth_server_app_id: "schemavaults-auth",
  } as const;

  test("createResourceUrlAudienceSchema accepts absolute http(s) URLs without fragments", () => {
    const schema = createResourceUrlAudienceSchema(z);
    expect(schema.safeParse("https://mcp.example.com/mcp").success).toBe(true);
    expect(schema.safeParse("http://127.0.0.1:3007").success).toBe(true);
    expect(schema.safeParse("https://mcp.example.com/mcp#frag").success).toBe(false);
    expect(schema.safeParse("com.example.app:/cb").success).toBe(false);
    expect(schema.safeParse("mcp.example.com").success).toBe(false);
    expect(schema.safeParse("").success).toBe(false);
  });

  test("createAudienceSchema accepts the URL form alongside the existing forms", () => {
    const schema = createAudienceSchema(z, "production", overrides);
    expect(schema.safeParse("https://auth.example.com").success).toBe(true);
    expect(schema.safeParse("00000000-0000-0000-0000-000000000000").success).toBe(true);
    expect(schema.safeParse("https://mcp.example.com/mcp").success).toBe(true);
    // The bare auth app id stays forbidden.
    expect(schema.safeParse("schemavaults-auth").success).toBe(false);
    expect(schema.safeParse("not a url or id!").success).toBe(false);
  });

  test("isResourceUrlAudience distinguishes resource URLs from the auth server URL and ids", () => {
    expect(isResourceUrlAudience("https://mcp.example.com/mcp", "production", overrides)).toBe(true);
    expect(isResourceUrlAudience("https://auth.example.com", "production", overrides)).toBe(false);
    expect(isResourceUrlAudience("00000000-0000-0000-0000-000000000000", "production", overrides)).toBe(false);
    expect(isResourceUrlAudience("", "production", overrides)).toBe(false);
  });
});
