import { describe, expect, test } from "bun:test";
import {
  DEFAULT_AUTH_SCOPE,
  OIDC_SUPPORTED_SCOPES,
  oidcScopeSchema,
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

  test("dedupes single-space repeats but rejects multiple spaces/delimiters", () => {
    // Repeated tokens separated by a SINGLE space still dedupe to the
    // granted set.
    expect(parseAndGrantScopes("openid openid email openid").granted).toEqual([
      "openid",
      "email",
    ]);

    // Multiple spaces / delimiters are malformed per RFC 6749 §3.3, so
    // parseAndGrantScopes (which now enforces oidcScopeSchema) grants
    // nothing rather than collapsing the repeated separators.
    const { granted, hasOpenid } = parseAndGrantScopes(
      "openid  openid   email openid",
    );
    expect(granted).toEqual([]);
    expect(hasOpenid).toBe(false);
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

describe("oidcScopeSchema (RFC 6749 §3.3 wire format)", () => {
  test("accepts single- and multi-token space-delimited scopes", () => {
    for (const valid of [
      "openid",
      "openid email",
      "openid email profile",
      DEFAULT_AUTH_SCOPE,
      // Format-valid even though not all tokens are supported — grant
      // filtering is parseAndGrantScopes's job, not the schema's.
      "openid address offline_access",
    ]) {
      expect(oidcScopeSchema.safeParse(valid).success).toBe(true);
    }
  });

  test("rejects irregular whitespace (leading / trailing / repeated)", () => {
    for (const invalid of [
      "",
      " openid",
      "openid ",
      "openid  email",
      "openid\temail",
      "openid\nemail",
    ]) {
      expect(oidcScopeSchema.safeParse(invalid).success).toBe(false);
    }
  });

  test("rejects control chars and the excluded '\"' / '\\' tokens", () => {
    for (const invalid of [
      "open\x00id",
      "openid\r\nSet-Cookie: x",
      'openid "email"',
      "openid ema\\il",
    ]) {
      expect(oidcScopeSchema.safeParse(invalid).success).toBe(false);
    }
  });

  test("rejects scopes longer than 256 chars", () => {
    expect(oidcScopeSchema.safeParse("openid".repeat(50)).success).toBe(false);
  });
});
