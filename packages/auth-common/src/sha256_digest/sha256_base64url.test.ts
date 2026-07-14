import { describe, expect, test } from "bun:test";
import { sha256_base64url } from "./sha256_digest";

describe("sha256_base64url", () => {
  // RFC 7636 Appendix B reference vector
  const RFC7636_VERIFIER = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
  const RFC7636_CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";

  test("matches the RFC 7636 Appendix B test vector", async () => {
    expect(await sha256_base64url(RFC7636_VERIFIER)).toBe(RFC7636_CHALLENGE);
  });

  test("emits strict base64url: 43 chars, no '+', '/', or '='", async () => {
    for (let i = 0; i < 50; i++) {
      const digest = await sha256_base64url(`input-${i}-${"x".repeat(i)}`);
      expect(digest).toHaveLength(43);
      expect(digest).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });

});
