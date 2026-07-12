import { describe, expect, test } from "bun:test";
import {
  OIDC_SUPPORTED_SCOPES,
  parseAndGrantScopes,
  serializeOidcScopes,
} from "./scope";

describe("parseAndGrantScopes", () => {
  test("grants the supported subset in request order", () => {
    const { granted, hasOpenid } = parseAndGrantScopes("openid profile email");
    expect(granted).toEqual(["openid", "profile", "email"]);
    expect(hasOpenid).toBe(true);
  });

  test("silently drops unknown scopes (RFC 6749 §3.3)", () => {
    const { granted, hasOpenid } = parseAndGrantScopes(
      "openid address phone offline_access email",
    );
    expect(granted).toEqual(["openid", "email"]);
    expect(hasOpenid).toBe(true);
  });

  test("reports a missing openid scope", () => {
    const { granted, hasOpenid } = parseAndGrantScopes("email profile");
    expect(granted).toEqual(["email", "profile"]);
    expect(hasOpenid).toBe(false);
  });

  test("deduplicates and collapses repeated separators", () => {
    const { granted } = parseAndGrantScopes("openid  openid   email openid");
    expect(granted).toEqual(["openid", "email"]);
  });

  test("grants nothing on non-string or empty input", () => {
    for (const raw of [undefined, null, 42, ["openid"], "", "   "]) {
      const { granted, hasOpenid } = parseAndGrantScopes(raw);
      expect(granted).toEqual([]);
      expect(hasOpenid).toBe(false);
    }
  });

  test("every supported scope round-trips through serialize", () => {
    const wire = serializeOidcScopes(OIDC_SUPPORTED_SCOPES);
    expect(wire).toBe("openid email profile");
    expect(parseAndGrantScopes(wire).granted).toEqual([
      ...OIDC_SUPPORTED_SCOPES,
    ]);
  });
});
