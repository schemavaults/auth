import { describe, test, expect } from "bun:test";
import {
  generateTotpSecret,
  buildOtpAuthUrl,
  matchTotpTimeStep,
  totpTimeStepAt,
  generateTotpCodeForTesting,
  TOTP_STEP_SECONDS,
} from "./totp";

const STEP_MS = TOTP_STEP_SECONDS * 1000;

describe("TOTP", () => {
  test("generated secret is non-empty base32", () => {
    const secret = generateTotpSecret();
    expect(typeof secret).toBe("string");
    expect(secret.length).toBeGreaterThanOrEqual(16);
    expect(secret).toMatch(/^[A-Z2-7]+$/);
  });

  test("totpTimeStepAt is floor(unix seconds / 30)", () => {
    expect(totpTimeStepAt(0)).toBe(0);
    expect(totpTimeStepAt(29_999)).toBe(0);
    expect(totpTimeStepAt(30_000)).toBe(1);
    // RFC 6238 Appendix B: T = 0x23523EC at 2005-03-18T01:58:29Z.
    expect(totpTimeStepAt(1_111_111_109_000)).toBe(0x23523ec);
  });

  test("a current code matches the current time step", () => {
    const secret = generateTotpSecret();
    const now = Date.now();
    const code = generateTotpCodeForTesting(secret, now);
    expect(code).toMatch(/^\d{6}$/);
    expect(matchTotpTimeStep({ secret, code, at_ms: now })).toBe(
      totpTimeStepAt(now),
    );
    // Defaults to the current time.
    const liveCode = generateTotpCodeForTesting(secret);
    const liveStep = matchTotpTimeStep({ secret, code: liveCode });
    expect(liveStep).not.toBeNull();
    expect(Math.abs((liveStep as number) - totpTimeStepAt(Date.now()))).toBeLessThanOrEqual(1);
  });

  test("codes one step either side match their own step (drift window)", () => {
    const secret = generateTotpSecret();
    const at_ms = 1_700_000_000_000;
    const step = totpTimeStepAt(at_ms);
    const previous = generateTotpCodeForTesting(secret, at_ms - STEP_MS);
    const next = generateTotpCodeForTesting(secret, at_ms + STEP_MS);
    expect(matchTotpTimeStep({ secret, code: previous, at_ms })).toBe(step - 1);
    expect(matchTotpTimeStep({ secret, code: next, at_ms })).toBe(step + 1);
  });

  test("codes two or more steps away do not match", () => {
    const secret = generateTotpSecret();
    const at_ms = 1_700_000_000_000;
    const current = generateTotpCodeForTesting(secret, at_ms);
    for (const offset of [-2, 2, -3, 3]) {
      const code = generateTotpCodeForTesting(secret, at_ms + offset * STEP_MS);
      // Two steps can share a code by chance (1 in 10^6); skip that case.
      if (code === current) continue;
      expect(matchTotpTimeStep({ secret, code, at_ms })).toBeNull();
    }
  });

  test("rejects wrong and malformed codes", () => {
    const secret = generateTotpSecret();
    const at_ms = 1_700_000_000_000;
    const valid = new Set(
      [-1, 0, 1].map((o) => generateTotpCodeForTesting(secret, at_ms + o * STEP_MS)),
    );
    const wrong = ["000000", "123456", "999999"].find((c) => !valid.has(c));
    expect(matchTotpTimeStep({ secret, code: wrong as string, at_ms })).toBeNull();
    expect(matchTotpTimeStep({ secret, code: "abcdef", at_ms })).toBeNull();
    expect(matchTotpTimeStep({ secret, code: "", at_ms })).toBeNull();
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
    expect(url).toContain("period=30");
  });
});
