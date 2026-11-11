import { describe, expect, test } from "bun:test";
import { defineScopes } from "./scope-definition";
import { oidcScopes } from "./oidc-scopes";
import { formatScope, missingFromScope, parseScope, scopeIncludes } from "./scope-string";

const notesScopes = defineScopes({
  read: { scope: "notes:read", description: "Read your notes" },
  write: { scope: "notes:write", description: "Edit your notes" },
});

describe("parseScope", () => {
  test("splits a space-delimited scope, dropping empty and repeated values", () => {
    expect(parseScope("openid  notes:read openid ")).toEqual(["openid", "notes:read"]);
    expect(parseScope(["openid email", "notes:read", "openid"])).toEqual(["openid", "email", "notes:read"]);
  });

  test("a missing scope is the empty scope", () => {
    expect(parseScope(null)).toEqual([]);
    expect(parseScope(undefined)).toEqual([]);
    expect(parseScope("")).toEqual([]);
  });
});

describe("formatScope", () => {
  test("joins values and definitions with single spaces, each once, in order", () => {
    expect(formatScope([oidcScopes.openid, notesScopes.read, "email", oidcScopes.openid])).toBe(
      "openid notes:read email",
    );
  });

  test("normalizes a string", () => {
    expect(formatScope(" openid   email openid")).toBe("openid email");
  });

  test("an empty list is the empty string", () => {
    expect(formatScope([])).toBe("");
  });
});

describe("scopeIncludes / missingFromScope", () => {
  test("checks a granted scope string or list against values and definitions", () => {
    expect(scopeIncludes("openid notes:read", notesScopes.read, "openid")).toBe(true);
    expect(scopeIncludes(["openid", "notes:read"], notesScopes.read)).toBe(true);
    expect(scopeIncludes("openid", notesScopes.read)).toBe(false);
    expect(scopeIncludes(null, notesScopes.read)).toBe(false);
    expect(scopeIncludes(null)).toBe(true);
  });

  test("missingFromScope lists what is missing, in order", () => {
    expect(missingFromScope("notes:read", [oidcScopes.openid, notesScopes.read, notesScopes.write])).toEqual([
      "openid",
      "notes:write",
    ]);
  });
});
