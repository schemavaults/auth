import { describe, test, expect } from "bun:test";
import {
  generateTotpSecret,
  buildOtpAuthUrl,
  verifyTotpCode,
  generateTotpCodeForTesting,
} from "./totp";

describe("TOTP", () => {
  test("generated secret is non-empty base32", () => {
    const secret = generateTotpSecret();
    expect(typeof secret).toBe("string");
    expect(secret.length).toBeGreaterThanOrEqual(16);
    expect(secret).toMatch(/^[A-Z2-7]+$/);
  });

  test("generates codes that verify against the same secret", () => {
    const secret = generateTotpSecret();
    const code = generateTotpCodeForTesting(secret);
    expect(code).toMatch(/^\d{6}$/);
    expect(verifyTotpCode({ secret, code })).toBe(true);
  });

  test("rejects wrong codes", () => {
    const secret = generateTotpSecret();
    expect(verifyTotpCode({ secret, code: "000000" })).toBe(false);
    expect(verifyTotpCode({ secret, code: "abcdef" })).toBe(false);
  });

  test("buildOtpAuthUrl produces a well-formed otpauth:// URL", () => {
    const secret = generateTotpSecret();
    const url = buildOtpAuthUrl({
      account_label: "user@example.com",
      secret,
    });
    expect(url.startsWith("otpauth://totp/")).toBe(true);
    expect(url).toContain("SchemaVaults");
    expect(url).toContain(`secret=${secret}`);
  });
});
