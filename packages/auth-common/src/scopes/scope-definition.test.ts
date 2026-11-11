import { describe, expect, test } from "bun:test";
import {
  MAX_SCOPE_DESCRIPTION_LENGTH,
  MAX_SCOPE_VALUE_LENGTH,
  defineScope,
  defineScopes,
  isScopeDefinition,
  isScopeToken,
  scopeDefinitionProblem,
  scopeValue,
  scopeValues,
} from "./scope-definition";
import { MAX_API_SCOPE_DESCRIPTION_LENGTH, MAX_API_SCOPE_VALUE_LENGTH } from "../api-scopes/api-server-scope";

const LONGEST_SCOPE = `notes:${"r".repeat(MAX_SCOPE_VALUE_LENGTH - "notes:".length)}`;
const LONGEST_DESCRIPTION = "d".repeat(MAX_SCOPE_DESCRIPTION_LENGTH);
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

  test("refuses a scope or description longer than the auth server accepts", () => {
    expect(defineScope({ scope: LONGEST_SCOPE, description: LONGEST_DESCRIPTION }).scope).toBe(LONGEST_SCOPE);
    expect(() => defineScope({ scope: `${LONGEST_SCOPE}x`, description: "x" })).toThrow(
      `is 129 characters long; a scope is at most 128`,
    );
    expect(() =>
      defineScope({ scope: "notes:read", description: `${LONGEST_DESCRIPTION}d` }),
    ).toThrow('The description of scope "notes:read" is 257 characters long; a description is at most 256');
    // Measured once trimmed, as it is stored.
    expect(defineScope({ scope: "notes:read", description: `  ${LONGEST_DESCRIPTION}  ` }).description).toBe(
      LONGEST_DESCRIPTION,
    );
  });

  test("uses the auth server's limits for API scopes", () => {
    expect(MAX_SCOPE_VALUE_LENGTH).toBe(MAX_API_SCOPE_VALUE_LENGTH);
    expect(MAX_SCOPE_DESCRIPTION_LENGTH).toBe(MAX_API_SCOPE_DESCRIPTION_LENGTH);
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

  test("isScopeDefinition accepts what defineScope() accepts", () => {
    expect(isScopeDefinition(oidcScopes.email)).toBe(true);
    expect(isScopeDefinition({ scope: "notes:read", description: "Read your notes" })).toBe(true);
    expect(isScopeDefinition({ scope: LONGEST_SCOPE, description: ` ${LONGEST_DESCRIPTION} ` })).toBe(true);
  });

  test("isScopeDefinition refuses malformed values, not just non-strings", () => {
    for (const value of [
      "email",
      null,
      [],
      { scope: "x" },
      { scope: 42, description: "x" },
      { scope: "", description: "Read" },
      { scope: "notes read", description: "Read" },
      { scope: 'notes"read', description: "Read" },
      { scope: "notes\\read", description: "Read" },
      { scope: "notés", description: "Read" },
      { scope: `${LONGEST_SCOPE}x`, description: "Read" },
      { scope: "notes:read", description: "" },
      { scope: "notes:read", description: " \t " },
      { scope: "notes:read", description: `${LONGEST_DESCRIPTION}d` },
    ]) {
      expect(isScopeDefinition(value)).toBe(false);
    }
  });

  test("scopeDefinitionProblem says what is wrong", () => {
    expect(scopeDefinitionProblem(oidcScopes.email)).toBeNull();
    expect(scopeDefinitionProblem([])).toBe("A scope definition must be an object { scope, description }");
    expect(scopeDefinitionProblem({ description: "x" })).toBe("A scope definition's scope must be a string");
    expect(scopeDefinitionProblem({ scope: "notes read", description: "x" })).toMatch(
      /^Scope "notes read" is not a single RFC 6749 scope-token/,
    );
    // Long values are shortened in the message.
    expect(scopeDefinitionProblem({ scope: "s".repeat(500), description: "x" })).toBe(
      `Scope "${"s".repeat(64)}…" is 500 characters long; a scope is at most 128`,
    );
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
