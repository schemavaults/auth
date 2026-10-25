import { describe, expect, test } from "bun:test";
import {
  MAX_API_SCOPES_PER_API_SERVER,
  MAX_API_SCOPE_DESCRIPTION_LENGTH,
  MAX_API_SCOPE_VALUE_LENGTH,
} from "./api-server-scope";
import {
  apiScopeManifestEntries,
  hasApiScopeSyncDrift,
  syncApiServerScopesRequestSchema,
  syncApiServerScopesResponseSchema,
} from "./scope-sync";

function manyScopes(count: number): { scope: string; description: string }[] {
  return Array.from({ length: count }, (_, index) => ({
    scope: `scope:${index}`,
    description: `Scope number ${index}`,
  }));
}

describe("syncApiServerScopesRequestSchema", () => {
  test("accepts a manifest, trimming descriptions and keeping allow_dynamic_clients optional", () => {
    const parsed = syncApiServerScopesRequestSchema.parse({
      scopes: [
        { scope: "notes:read", description: "  Read your notes.  " },
        {
          scope: "notes:write",
          description: "Create, edit and delete your notes.",
          allow_dynamic_clients: false,
        },
      ],
    });
    expect(parsed.scopes).toEqual([
      { scope: "notes:read", description: "Read your notes." },
      {
        scope: "notes:write",
        description: "Create, edit and delete your notes.",
        allow_dynamic_clients: false,
      },
    ]);
  });

  test("accepts an empty list", () => {
    expect(syncApiServerScopesRequestSchema.safeParse({ scopes: [] }).success).toBe(true);
  });

  test("accepts $schema and ignores it", () => {
    const parsed = syncApiServerScopesRequestSchema.parse({
      $schema: "https://auth.schemavaults.com/json-schema/api-server-scopes.json",
      scopes: [{ scope: "notes:read", description: "Read your notes." }],
    });
    expect(parsed.scopes).toHaveLength(1);
    expect(syncApiServerScopesRequestSchema.safeParse({ $schema: 1, scopes: [] }).success).toBe(false);
  });

  test("refuses a scope value listed twice", () => {
    const result = syncApiServerScopesRequestSchema.safeParse({
      scopes: [
        { scope: "notes:read", description: "Read your notes." },
        { scope: "notes:read", description: "Read them again." },
      ],
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["scopes", 1, "scope"]);
  });

  test("refuses OIDC scope names, invalid and over-long values", () => {
    for (const scope of [
      "openid",
      "offline_access",
      "notes read",
      "",
      "a".repeat(MAX_API_SCOPE_VALUE_LENGTH + 1),
    ]) {
      expect(
        syncApiServerScopesRequestSchema.safeParse({
          scopes: [{ scope, description: "Something." }],
        }).success,
        scope,
      ).toBe(false);
    }
  });

  test("refuses missing, blank and over-long descriptions", () => {
    for (const entry of [
      { scope: "notes:read" },
      { scope: "notes:read", description: "   " },
      { scope: "notes:read", description: "d".repeat(MAX_API_SCOPE_DESCRIPTION_LENGTH + 1) },
    ]) {
      expect(syncApiServerScopesRequestSchema.safeParse({ scopes: [entry] }).success).toBe(false);
    }
  });

  test(`refuses more than ${MAX_API_SCOPES_PER_API_SERVER} entries`, () => {
    expect(
      syncApiServerScopesRequestSchema.safeParse({ scopes: manyScopes(MAX_API_SCOPES_PER_API_SERVER) }).success,
    ).toBe(true);
    expect(
      syncApiServerScopesRequestSchema.safeParse({ scopes: manyScopes(MAX_API_SCOPES_PER_API_SERVER + 1) }).success,
    ).toBe(false);
  });

  test("refuses unknown keys on the manifest and its entries", () => {
    expect(syncApiServerScopesRequestSchema.safeParse({ scopes: [], prune: true }).success).toBe(false);
    expect(
      syncApiServerScopesRequestSchema.safeParse({
        scopes: [{ scope: "notes:read", description: "Read your notes.", hidden: true }],
      }).success,
    ).toBe(false);
  });
});

describe("apiScopeManifestEntries", () => {
  test("both manifest shapes parse to the same request", () => {
    const fromList = syncApiServerScopesRequestSchema.parse({
      scopes: apiScopeManifestEntries([
        { scope: "notes:read", description: "Read your notes." },
        { scope: "notes:write", description: "Write your notes." },
      ]),
    });
    const fromRecord = syncApiServerScopesRequestSchema.parse({
      scopes: apiScopeManifestEntries({
        "notes:read": "Read your notes.",
        "notes:write": "Write your notes.",
      }),
    });
    expect(fromRecord).toEqual(fromList);
  });
});

describe("syncApiServerScopesResponseSchema", () => {
  const body = {
    success: true,
    data: {
      api_server_id: "notes-api",
      dry_run: false,
      created: [{ scope: "notes:read", description: "Read your notes.", allow_dynamic_clients: true }],
      updated: [
        {
          scope: "notes:write",
          description: "Create, edit and delete your notes.",
          allow_dynamic_clients: true,
          previous: { allow_dynamic_clients: false },
        },
      ],
      unchanged: ["notes:share"],
      not_in_manifest: [{ scope: "legacy:read", description: "Legacy." }],
    },
  };

  test("parses the documented response", () => {
    const parsed = syncApiServerScopesResponseSchema.parse(body);
    expect(parsed.data.updated[0]?.previous).toEqual({ allow_dynamic_clients: false });
    expect(hasApiScopeSyncDrift(parsed.data)).toBe(true);
  });

  test("a sync that changed nothing has no drift", () => {
    const parsed = syncApiServerScopesResponseSchema.parse({
      ...body,
      data: { ...body.data, created: [], updated: [] },
    });
    expect(hasApiScopeSyncDrift(parsed.data)).toBe(false);
  });
});
