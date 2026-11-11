import { describe, expect, test } from "bun:test";
import {
  defineScope,
  defineScopes,
  isScopeDefinition,
  isScopeToken,
  scopeValue,
  scopeValues,
} from "./scope-definition";
import { oidcScopes } from "./oidc-scopes";
import { OIDC_RESERVED_SCOPES } from "../oidc/scope-names";

describe("isScopeToken", () => {
  test("accepts RFC 6749 scope-tokens", () => {
    for (const value of ["email", "notes:read", "example:notes.read", "https://api.example.com/read", "a!#[]~"]) {
      expect(isScopeToken(value)).toBe(true);
    }
  });

  test("refuses empty values, spaces, quotes, backslashes and non-ASCII", () => {
    for (const value of ["", "notes read", 'notes"read', "notes\\read", "notes\tread", "notés", 42, null]) {
      expect(isScopeToken(value)).toBe(false);
    }
  });
});

describe("defineScope", () => {
  test("returns a frozen { scope, description } with the description trimmed", () => {
    const scope = defineScope({ scope: "notes:read", description: "  Read your notes " });
    expect(scope).toEqual({ scope: "notes:read", description: "Read your notes" });
    expect(Object.isFrozen(scope)).toBe(true);
  });

  test("keeps only the manifest keys", () => {
    const input = { scope: "notes:read", description: "Read your notes", extra: true };
    expect(Object.keys(defineScope(input))).toEqual(["scope", "description"]);
  });

  test("refuses invalid values and blank descriptions", () => {
    expect(() => defineScope({ scope: "notes read", description: "x" })).toThrow(/scope-token/);
    expect(() => defineScope({ scope: "", description: "x" })).toThrow(/scope-token/);
    expect(() => defineScope({ scope: "notes:read", description: "   " })).toThrow(/description/);
  });
});

describe("defineScopes", () => {
  test("defines every entry under its key, preserving the literal scope type", () => {
    const scopes = defineScopes({
      read: { scope: "notes:read", description: "Read your notes" },
      write: { scope: "notes:write", description: "Edit your notes" },
    });
    const read: "notes:read" = scopes.read.scope;
    expect(read).toBe("notes:read");
    expect(Object.values(scopes).map((scope) => scope.scope)).toEqual(["notes:read", "notes:write"]);
    expect(Object.isFrozen(scopes)).toBe(true);
    expect(Object.isFrozen(scopes.write)).toBe(true);
  });

  test("refuses a scope value defined under two keys", () => {
    expect(() =>
      defineScopes({
        read: { scope: "notes:read", description: "Read your notes" },
        alsoRead: { scope: "notes:read", description: "Read notes" },
      }),
    ).toThrow('Scope "notes:read" is defined twice (as "read" and "alsoRead")');
  });
});

describe("scope values", () => {
  test("scopeValue / scopeValues accept values and definitions", () => {
    expect(scopeValue("email")).toBe("email");
    expect(scopeValue(oidcScopes.email)).toBe("email");
    expect(scopeValues(["openid", oidcScopes.profile])).toEqual(["openid", "profile"]);
    expect(scopeValues(undefined)).toEqual([]);
  });

  test("isScopeDefinition", () => {
    expect(isScopeDefinition(oidcScopes.email)).toBe(true);
    expect(isScopeDefinition({ scope: "x" })).toBe(false);
    expect(isScopeDefinition("email")).toBe(false);
  });

  test("oidcScopes defines every OIDC_RESERVED_SCOPES value under its own name", () => {
    expect(Object.keys(oidcScopes)).toEqual([...OIDC_RESERVED_SCOPES]);
    for (const [key, definition] of Object.entries(oidcScopes)) {
      expect(definition.scope as string).toBe(key);
      expect(definition.description.length).toBeGreaterThan(0);
    }
    expect(oidcScopes.email).toEqual({ scope: "email", description: "Read your email address" });
    expect(Object.isFrozen(oidcScopes)).toBe(true);
  });
});
