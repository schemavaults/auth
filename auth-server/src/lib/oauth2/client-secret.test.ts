import { describe, expect, test } from "bun:test";
import {
  CLIENT_SECRET_PREFIX,
  generateClientSecret,
  hashClientSecret,
  verifyClientSecret,
} from "./client-secret";

describe("client-secret", () => {
  test("generateClientSecret produces unique prefixed high-entropy secrets", () => {
    const a = generateClientSecret();
    const b = generateClientSecret();
    expect(a).toStartWith(CLIENT_SECRET_PREFIX);
    expect(b).toStartWith(CLIENT_SECRET_PREFIX);
    expect(a).not.toEqual(b);
    // 32 random bytes base64url-encoded is 43 characters
    expect(a.length).toBe(CLIENT_SECRET_PREFIX.length + 43);
  });

  test("hashClientSecret is a deterministic hex sha256 digest", () => {
    const secret = generateClientSecret();
    const hash = hashClientSecret(secret);
    expect(hash).toBe(hashClientSecret(secret));
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain(secret);
  });

  test("verifyClientSecret accepts the generated secret against its hash", () => {
    const secret = generateClientSecret();
    const hash = hashClientSecret(secret);
    expect(verifyClientSecret(secret, hash)).toBe(true);
  });

  test("verifyClientSecret rejects wrong or empty values", () => {
    const secret = generateClientSecret();
    const hash = hashClientSecret(secret);
    expect(verifyClientSecret(generateClientSecret(), hash)).toBe(false);
    expect(verifyClientSecret(`${secret} `, hash)).toBe(false);
    expect(verifyClientSecret("", hash)).toBe(false);
    expect(verifyClientSecret(secret, "")).toBe(false);
  });
});
