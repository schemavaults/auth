import { describe, expect, test } from "bun:test";
import {
  MAX_API_SCOPE_VALUE_LENGTH,
  apiScopeDescriptionSchema,
  apiScopeValueSchema,
  createApiServerScopeRequestSchema,
} from "./api-server-scope";

describe("apiScopeValueSchema", () => {
  test("accepts single RFC 6749 scope-tokens", () => {
    for (const valid of [
      "notes:read",
      "mcp:tools",
      "read",
      "https://api.example.com/auth/drive.readonly",
      "a".repeat(MAX_API_SCOPE_VALUE_LENGTH),
    ]) {
      expect(apiScopeValueSchema.safeParse(valid).success).toBe(true);
    }
  });

  test("rejects whitespace, excluded characters and over-long values", () => {
    for (const invalid of [
      "",
      "notes read",
      "notes:read ",
      'notes:"read"',
      "notes\\read",
      "notes\tread",
      "ünïcode",
      "a".repeat(MAX_API_SCOPE_VALUE_LENGTH + 1),
    ]) {
      expect(apiScopeValueSchema.safeParse(invalid).success).toBe(false);
    }
  });

  test("rejects the OIDC scope names", () => {
    for (const reserved of [
      "openid",
      "profile",
      "email",
      "address",
      "phone",
      "offline_access",
    ]) {
      expect(apiScopeValueSchema.safeParse(reserved).success).toBe(false);
    }
  });
});

describe("apiScopeDescriptionSchema", () => {
  test("trims and requires a non-empty description", () => {
    expect(apiScopeDescriptionSchema.parse("  Read your notes  ")).toBe(
      "Read your notes",
    );
    expect(apiScopeDescriptionSchema.safeParse("   ").success).toBe(false);
  });
});

describe("createApiServerScopeRequestSchema", () => {
  test("rejects unknown keys", () => {
    expect(
      createApiServerScopeRequestSchema.safeParse({
        scope: "notes:read",
        description: "Read your notes",
        extra: true,
      }).success,
    ).toBe(false);
  });
});
