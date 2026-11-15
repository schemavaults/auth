import { describe, expect, test } from "bun:test";
import { MAX_PKCE_CODE_VERIFIER_AGE } from "@schemavaults/auth-common/pkce/code_verifier.js";
import { pkceFlowExpiresAt } from "./pkce-flow-expires-at";

const NOW = 1_700_000_000_000;

describe("pkceFlowExpiresAt", () => {
  test("is the challenge time plus the PKCE challenge lifetime", () => {
    expect(pkceFlowExpiresAt(String(NOW - 1000), NOW)).toBe(NOW - 1000 + MAX_PKCE_CODE_VERIFIER_AGE);
  });

  test("tolerates a requesting app whose clock runs a little ahead", () => {
    expect(pkceFlowExpiresAt(String(NOW + 60_000), NOW)).toBe(NOW + 60_000 + MAX_PKCE_CODE_VERIFIER_AGE);
  });

  test("ignores absent, malformed and implausible values", () => {
    for (const value of [null, undefined, "", "abc", "-5", "1.5", "0", " 1700000000000", String(NOW + 60 * 60 * 1000)]) {
      expect(pkceFlowExpiresAt(value, NOW)).toBeNull();
    }
  });
});
