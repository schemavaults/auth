import { describe, expect, test } from "bun:test";
import { oidcScopes } from "@schemavaults/auth-common/scopes";
import { assertScopeRequirements } from "./assert-scope-requirements";

describe("assertScopeRequirements", () => {
  test("accepts undefined, values and definitions", () => {
    expect(() => assertScopeRequirements(undefined)).not.toThrow();
    expect(() => assertScopeRequirements(["email", oidcScopes.profile])).not.toThrow();
    expect(() =>
      assertScopeRequirements([{ scope: "notes:read", description: "hand-written definition" }]),
    ).not.toThrow();
  });

  test("refuses a space separated string, repeats and other values", () => {
    expect(() => assertScopeRequirements(["openid email"])).toThrow(/list each scope separately/);
    expect(() => assertScopeRequirements(["email", oidcScopes.email])).toThrow(
      'Required scope "email" listed twice',
    );
    expect(() => assertScopeRequirements([{ scope: "email" }])).toThrow(
      'requiredScopes entries must be scope values or valid scope definitions: Scope "email" needs a non-empty description',
    );
    expect(() =>
      assertScopeRequirements([{ scope: "notes read", description: "Read your notes" }]),
    ).toThrow(/valid scope definitions: Scope "notes read" is not a single RFC 6749 scope-token/);
    expect(() =>
      assertScopeRequirements([{ scope: "notes:read", description: "d".repeat(257) }]),
    ).toThrow(/a description is at most 256/);
    expect(() => assertScopeRequirements([42])).toThrow(/must be an object/);
    expect(() => assertScopeRequirements("email")).toThrow(/must be a list/);
  });
});
