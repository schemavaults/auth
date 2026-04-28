import { describe, test, expect, beforeAll } from "bun:test";
import { randomBytes } from "node:crypto";
import { hashRecoveryCode, normalizeRecoveryCode } from "./hash-recovery-code";

beforeAll(() => {
  process.env.PRIVATE_MFA_RECOVERY_PEPPER = randomBytes(32).toString("base64");
});

describe("normalizeRecoveryCode", () => {
  test("lowercases and strips dashes/whitespace", () => {
    expect(normalizeRecoveryCode("ABCDE-FGHIJ")).toBe("abcdefghij");
    expect(normalizeRecoveryCode("  abcde fghij  ")).toBe("abcdefghij");
    expect(normalizeRecoveryCode("AB-CD-EF")).toBe("abcdef");
  });
});

describe("hashRecoveryCode", () => {
  test("normalization-equivalent inputs produce identical hashes", () => {
    const a = hashRecoveryCode("ABCDE-FGHIJ");
    const b = hashRecoveryCode("abcdefghij");
    const c = hashRecoveryCode("  AB CDE-FG hij ");
    expect(a).toBe(b);
    expect(a).toBe(c);
  });

  test("different codes produce different hashes", () => {
    const a = hashRecoveryCode("abcdefghij");
    const b = hashRecoveryCode("klmnopqrst");
    expect(a).not.toBe(b);
  });

  test("output is hex sha256 (64 chars)", () => {
    const h = hashRecoveryCode("test-test1");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });
});
