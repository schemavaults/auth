import { describe, expect, test } from "bun:test";
import {
  MAX_API_SCOPE_VALUE_LENGTH,
  apiScopeDescriptionSchema,
  apiScopeValueSchema,
  createApiServerScopeRequestSchema,
  updateApiServerScopeRequestSchema,
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

  test("defaults allow_dynamic_clients to absent (the server defaults it on)", () => {
    const parsed = createApiServerScopeRequestSchema.safeParse({
      scope: "notes:read",
      description: "Read your notes",
    });
    expect(parsed.success).toBe(true);
    expect(parsed.data?.allow_dynamic_clients).toBeUndefined();
  });
});

describe("updateApiServerScopeRequestSchema", () => {
  test("accepts a description, the dynamic-client flag, or both", () => {
    expect(updateApiServerScopeRequestSchema.safeParse({ description: "Read notes" }).success).toBe(true);
    expect(updateApiServerScopeRequestSchema.safeParse({ allow_dynamic_clients: false }).success).toBe(true);
    expect(
      updateApiServerScopeRequestSchema.safeParse({
        description: "Read notes",
        allow_dynamic_clients: true,
      }).success,
    ).toBe(true);
  });

  test("rejects an empty update and unknown keys", () => {
    expect(updateApiServerScopeRequestSchema.safeParse({}).success).toBe(false);
    expect(
      updateApiServerScopeRequestSchema.safeParse({ description: "Read notes", scope: "x" }).success,
    ).toBe(false);
  });
});
