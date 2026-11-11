import { describe, expect, test } from "bun:test";
import { z } from "../zod-openapi";
import { defineOperation } from "../operation";
import { publicAccess, requireAuth, schemaVaultsAccessTokenBearerScheme } from "../auth-scheme";
import { collectScopes } from "./collect-scopes";
import { defineScopes, oidcScopes } from "@schemavaults/auth-common/scopes";

const notesScopes = defineScopes({
  read: { scope: "notes:read", description: "Read your notes" },
  write: { scope: "notes:write", description: "Edit your notes" },
  admin: { scope: "notes:admin", description: "Manage everyone's notes" },
});

function operation(path: string, requiredScopes?: Parameters<typeof requireAuth>[0]["requiredScopes"]) {
  return defineOperation({
    method: "get",
    path,
    summary: path,
    auth: requireAuth({ schemes: [schemaVaultsAccessTokenBearerScheme], requiredScopes }),
    responses: { 200: { description: "ok", schema: z.object({}) } },
    handler: (ctx) => ctx.json(200, {}),
  });
}

const health = defineOperation({
  method: "get",
  path: "/health",
  summary: "Health",
  auth: publicAccess(),
  responses: { 204: { description: "ok" } },
  handler: (ctx) => ctx.empty(204),
});

describe("collectScopes", () => {
  test("lists additional scopes first, then each operation's in first-seen order", () => {
    const scopes = collectScopes(
      [
        health,
        operation("/a", [notesScopes.read, "email"]),
        operation("/b", [notesScopes.write, notesScopes.read]),
        operation("/c"),
      ],
      [notesScopes.admin],
    );
    expect(scopes).toEqual([
      { scope: "notes:admin", description: "Manage everyone's notes" },
      { scope: "notes:read", description: "Read your notes" },
      { scope: "email" },
      { scope: "notes:write", description: "Edit your notes" },
    ]);
  });

  test("a definition describes a scope another operation names by value", () => {
    const scopes = collectScopes([operation("/a", ["email"]), operation("/b", [oidcScopes.email])]);
    expect(scopes).toEqual([{ scope: "email", description: "Read your email address" }]);
  });

  test("refuses two different descriptions of one scope", () => {
    expect(() =>
      collectScopes([
        operation("/a", [notesScopes.read]),
        operation("/b", [{ scope: "notes:read", description: "Read notes" }]),
      ]),
    ).toThrow('Scope "notes:read" is defined twice with different descriptions');
  });

  test("no operations, no scopes", () => {
    expect(collectScopes([health])).toEqual([]);
  });
});
