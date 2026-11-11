import { describe, expect, mock, test } from "bun:test";
import { OIDC_RESERVED_SCOPES } from "@schemavaults/auth-common";
import { collectScopes } from "@schemavaults/openapi-operations/scopes";
import { exampleApiScopes } from "./scopes";

// The operation modules (via ./context) import the `server-only` marker.
mock.module("server-only", () => ({}));

const oidcReserved = new Set<string>(OIDC_RESERVED_SCOPES);

describe("the API's scopes", () => {
  test("every API scope an operation requires is defined in exampleApiScopes", async () => {
    // So that defining (or syncing) exampleApiScopes on the auth server is
    // enough for tokens to be able to carry every scope the API enforces.
    const { operations } = await import("./operations");
    const defined = new Set<string>(Object.values(exampleApiScopes).map((scope) => scope.scope));
    const required = collectScopes(operations)
      .map((scope) => scope.scope)
      .filter((scope) => !oidcReserved.has(scope));
    expect(required.filter((scope) => !defined.has(scope))).toEqual([]);
  });

  test("exampleApiScopes only holds API scopes (never OIDC names)", () => {
    for (const { scope } of Object.values(exampleApiScopes)) {
      expect(oidcReserved.has(scope)).toBe(false);
    }
  });

  test("the OpenAPI document describes every required scope", async () => {
    const { openApiDocument } = await import("./openapi-document");
    expect(openApiDocument["x-schemavaults-scopes"]).toEqual([
      { scope: "example:notes.read", description: "Read your notes" },
      { scope: "email", description: "Read your email address" },
    ]);
  });
});
