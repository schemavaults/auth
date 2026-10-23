import { describe, expect, test } from "bun:test";
import { evaluateRequiredScopes } from "./evaluate-required-scopes";

describe("evaluateRequiredScopes", () => {
  test("passes when the token grants every required scope", () => {
    expect(
      evaluateRequiredScopes("openid email profile", ["email"]),
    ).toEqual({ ok: true });
    expect(
      evaluateRequiredScopes("openid email profile", [
        "openid",
        "email",
        "profile",
      ]),
    ).toEqual({ ok: true });
  });

  test("denies when the token is missing a required scope", () => {
    const result = evaluateRequiredScopes("openid", ["email"]);
    expect(result).toEqual({
      ok: false,
      reason: "missing_scopes",
      scopes: ["email"],
    });
  });

  test("a token without a scope claim grants NO scopes", () => {
    const result = evaluateRequiredScopes(undefined, ["openid"]);
    expect(result).toEqual({
      ok: false,
      reason: "missing_scopes",
      scopes: ["openid"],
    });
    expect(evaluateRequiredScopes("", ["openid"])).toEqual({
      ok: false,
      reason: "missing_scopes",
      scopes: ["openid"],
    });
  });

  test("rejects values no token can carry in the route configuration (server error)", () => {
    const result = evaluateRequiredScopes("openid email profile", [
      "email",
      "notes read",
      "offline_access",
    ]);
    expect(result).toEqual({
      ok: false,
      reason: "invalid_config",
      scopes: ["notes read", "offline_access"],
    });
  });

  test("enforces API scopes defined by the API server", () => {
    expect(
      evaluateRequiredScopes("openid notes:read notes:write", ["notes:read"]),
    ).toEqual({ ok: true });
    expect(evaluateRequiredScopes("openid email", ["notes:write"])).toEqual({
      ok: false,
      reason: "missing_scopes",
      scopes: ["notes:write"],
    });
  });

  test("no partial-string matches across the space-delimited claim", () => {
    // "email" must not match inside a hypothetical other token value.
    expect(evaluateRequiredScopes("openidemail", ["email"])).toEqual({
      ok: false,
      reason: "missing_scopes",
      scopes: ["email"],
    });
  });

  test("empty requirement always passes", () => {
    expect(evaluateRequiredScopes(undefined, [])).toEqual({ ok: true });
    expect(evaluateRequiredScopes("openid", [])).toEqual({ ok: true });
  });
});
