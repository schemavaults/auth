import { expect, describe, it } from "bun:test";
import { timingSafeEqual } from "node:crypto";

import { PKCE_ProofKeyManager } from "./pkce";
import type { CodeVerifierWithDetails } from "./code_verifier";
import type { CodeChallengeWithDetails } from "./code_challenge";

describe("PKCE_ProofKeyManager", () => {
  it("createCodeVerifier should return a code_verifier string of length between 43 and 1024", async () => {

    const code_verifier = PKCE_ProofKeyManager.createCodeVerifier();
    expect(code_verifier.code_verifier.length).toBeGreaterThanOrEqual(43);
    expect(code_verifier.code_verifier.length).toBeLessThanOrEqual(1024);
  });

  it("createCodeVerifier should return a string containing only characters in the set: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'", async () => {
    const code_verifier = PKCE_ProofKeyManager.createCodeVerifier();
    expect(code_verifier.code_verifier).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("getCodeChallenge should return a code_challenge string of length between 43 and 1024", async () => {
    const manager = new PKCE_ProofKeyManager();
    const code_challenge = await manager.getCodeChallenge();
    expect(code_challenge.code_challenge!.length).toBeGreaterThanOrEqual(43);
    expect(code_challenge.code_challenge!.length).toBeLessThanOrEqual(1024);
  });

  it("getCodeChallenge should return a string containing only characters in the set: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'", async () => {
    const manager = new PKCE_ProofKeyManager();
    const code_challenge = await manager.getCodeChallenge();
    expect(code_challenge.code_challenge).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("getCodeChallenge should return a code_challenge string that is a base64 encoded SHA-256 hash of the code_verifier", async () => {
    const code_verifier = PKCE_ProofKeyManager.createCodeVerifier();
    const manager = new PKCE_ProofKeyManager(code_verifier);
    const code_challenge = await manager.getCodeChallenge();

    // Hashes correctly?
    const encoder = new TextEncoder();
    const data: BufferSource = encoder.encode(code_verifier.code_verifier);
    const hash_buffer: ArrayBuffer = await crypto.subtle.digest("SHA-256", data);
    const base64_encoded_hash: string = Buffer.from(hash_buffer).toString("base64");
    const base64url_encoded_hash = base64_encoded_hash.replace(/[^A-Za-z0-9_-]/g, "_");
    expect(code_challenge.code_challenge).toBe(base64url_encoded_hash);

    // Object is the expected shape?
    expect(code_challenge.code_challenge_method).toBe("S256");
    expect(code_challenge.code_challenge!.length).toBeGreaterThan(43);
    expect(code_challenge.code_challenge!.length).toBeLessThanOrEqual(1024);
  });

  // Zod schemas should successfully validate the code_verifier and code_challenge
  it("codeVerifierSchema should validate a valid code_verifier", () => {
    const valid_code_verifier = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789ABCDEFGABCEDEFG";
    const parsed = PKCE_ProofKeyManager.codeVerifierSchema.safeParse(valid_code_verifier);
    if (!parsed.success) {
      console.error(parsed.error);
    }
    expect(parsed.success).toBe(true);

    const valid_code_verifier_2 = "eZx-tLR4TRHr2w_1iO2gFr2zRrL2YGQBd9CASF0p6eId9cSaEGvdGI_NDqv";
    const parsed_2 = PKCE_ProofKeyManager.codeVerifierSchema.safeParse(valid_code_verifier_2);
    if (!parsed_2.success) {
      console.error(parsed_2.error);
    }
    expect(parsed_2.success).toBe(true);
  });

  it("codeVerifierSchema should accept the output of createCodeVerifier", async () => {
    const code_verifier = PKCE_ProofKeyManager.createCodeVerifier();
    const parsed = PKCE_ProofKeyManager.codeVerifierSchema.safeParse(code_verifier.code_verifier);
    if (!parsed.success) {
      console.error(parsed.error);
    }
    expect(parsed.success).toBe(true);
  });

  it("codeVerifierSchema should not validate an invalid code_verifier", () => {
    const invalid_code_verifier = "PENIS";
    const parsed = PKCE_ProofKeyManager.codeVerifierSchema.safeParse(invalid_code_verifier);
    expect(parsed.success).toBe(false);
  });

  it("codeChallengeSchema should accept the output of getCodeChallenge", async () => {
    const code_verifier = PKCE_ProofKeyManager.createCodeVerifier();
    const pkce = new PKCE_ProofKeyManager(code_verifier);
    const code_challenge = await pkce.getCodeChallenge();
    const parsed = PKCE_ProofKeyManager.codeChallengeSchema.safeParse(code_challenge.code_challenge);
    expect(parsed.success).toBe(true);
  });

  it("isValidCodeVerifierFormat should accept the output of createCodeVerifier (and be stable)", async () => {
    for (let i = 0; i < 100; i++) {
      const now = Date.now();
      const code_verifier: CodeVerifierWithDetails = PKCE_ProofKeyManager.createCodeVerifier(now);
      expect(typeof code_verifier.code_verifier === 'string').toBeTrue()
      const isValid: boolean = PKCE_ProofKeyManager.isValidCodeVerifierFormat(code_verifier);
      expect(isValid).toBe(true);
    }
  });

  it("can generate a valid code challenge from a code verifier", async () => {
    for (let i = 0; i < 40; i++) {
      const now = Date.now();
      const code_verifier: CodeVerifierWithDetails = PKCE_ProofKeyManager.createCodeVerifier(now);
      const isValid: boolean = PKCE_ProofKeyManager.isValidCodeVerifierFormat(code_verifier);
      expect(isValid).toBe(true);

      const code_challenge: CodeChallengeWithDetails = await PKCE_ProofKeyManager.createCodeChallenge(code_verifier)
      const isValidChallengeFormat = PKCE_ProofKeyManager.isValidCodeChallengeFormat(code_challenge);
      expect(isValidChallengeFormat).toBe(true);


      const verifierMatchesChallenge: boolean = await PKCE_ProofKeyManager.doesVerifierMatchChallenge({
        input_code_verifier: code_verifier.code_verifier,
        saved_code_challenge: code_challenge.code_challenge,
        challenge_time: code_verifier.challenge_time,
        timingSafeEqual,
      })
      expect(verifierMatchesChallenge).toBe(true);
    }
  });
});
