import { describe, test, expect, beforeEach } from "bun:test";
import { randomBytes } from "node:crypto";
import { encryptSecret, decryptSecret, __resetKekCacheForTests } from "./kek";

beforeEach(() => {
  process.env.PRIVATE_MFA_SECRET_KEK = randomBytes(32).toString("base64");
  __resetKekCacheForTests();
});

describe("kek", () => {
  test("round-trip encrypts and decrypts", () => {
    const plaintext = "JBSWY3DPEHPK3PXP";
    const { ciphertext, kek_version } = encryptSecret(plaintext);
    expect(kek_version).toBe(1);
    expect(ciphertext.startsWith("v1:")).toBe(true);
    expect(ciphertext.includes(plaintext)).toBe(false);
    const recovered = decryptSecret(ciphertext, kek_version);
    expect(recovered).toBe(plaintext);
  });

  test("each encryption uses a fresh IV", () => {
    const a = encryptSecret("same-plaintext").ciphertext;
    const b = encryptSecret("same-plaintext").ciphertext;
    expect(a).not.toBe(b);
  });

  test("rejects ciphertext encrypted under a different key", () => {
    const { ciphertext } = encryptSecret("secret");
    process.env.PRIVATE_MFA_SECRET_KEK = randomBytes(32).toString("base64");
    __resetKekCacheForTests();
    expect(() => decryptSecret(ciphertext, 1)).toThrow();
  });

  test("rejects unknown kek_version", () => {
    const { ciphertext } = encryptSecret("secret");
    expect(() => decryptSecret(ciphertext, 99)).toThrow();
  });

  test("throws on missing env var", () => {
    delete process.env.PRIVATE_MFA_SECRET_KEK;
    __resetKekCacheForTests();
    expect(() => encryptSecret("x")).toThrow(/PRIVATE_MFA_SECRET_KEK/);
  });

  test("throws on malformed ciphertext", () => {
    expect(() => decryptSecret("not-a-valid-blob", 1)).toThrow();
  });
});
