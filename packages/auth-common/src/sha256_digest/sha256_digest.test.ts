import { describe, expect, test } from "bun:test";
import {
  type CodeVerifierWithDetails,
  create_code_verifier,
} from "@/pkce/code_verifier";
import cryptojs_pkg_sha256 from "./cryptojs_pkg_sha256";
import webcrypto_sha256 from "./webcrypto_sha256";

describe("sha256_digest", () => {
  test("insecure-context and secure-context versions return same result", async () => {
    const code_verifier: CodeVerifierWithDetails = create_code_verifier({
      challenge_time: Date.now(),
    });
    expect(code_verifier.code_verifier).toBeString();
    expect(code_verifier.code_verifier.length).toBeGreaterThan(0);

    const digested_a = await cryptojs_pkg_sha256(code_verifier.code_verifier);
    const digested_b = await webcrypto_sha256(code_verifier.code_verifier);
    expect(digested_a).toBeString();
    expect(digested_a.length).toBeGreaterThan(0);
    expect(digested_b).toBeString();
    expect(digested_b.length).toBeGreaterThan(0);
    expect(digested_a).toEqual(digested_b);
  });
});
