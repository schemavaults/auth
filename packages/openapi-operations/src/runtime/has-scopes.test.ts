import { describe, expect, test } from "bun:test";
import type { AuthPrincipal } from "../operation";
import { defineScope } from "../scopes/scope-definition";
import { oidcScopes } from "../scopes/oidc-scopes";
import { grantedScopes, hasScopes, missingScopes } from "./resolve-auth";

const notesRead = defineScope({ scope: "notes:read", description: "Read your notes" });

function principal(scope: string | null): AuthPrincipal {
  return { scheme: "test", user: null, isAdmin: true, scope };
}

describe("scope helpers", () => {
  test("grantedScopes splits the scope claim", () => {
    expect(grantedScopes(principal("openid  notes:read"))).toEqual(["openid", "notes:read"]);
    expect(grantedScopes(principal(null))).toEqual([]);
  });

  test("missingScopes accepts values and definitions", () => {
    expect(missingScopes(principal("openid"), [oidcScopes.openid, notesRead, "email"])).toEqual([
      "notes:read",
      "email",
    ]);
  });

  test("hasScopes needs every scope, a principal, and gives admins no bypass", () => {
    expect(hasScopes(principal("openid notes:read"), notesRead, "openid")).toBe(true);
    expect(hasScopes(principal("openid"), notesRead)).toBe(false);
    expect(hasScopes(principal(null), notesRead)).toBe(false);
    expect(hasScopes(principal(null))).toBe(true);
    expect(hasScopes(null, notesRead)).toBe(false);
    expect(hasScopes(undefined)).toBe(false);
  });
});
