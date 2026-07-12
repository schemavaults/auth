import {
  create_code_challenge,
  codeChallengeSchema,
  code_challenge_method,
  type CreateCodeChallengeInputOptions,
  type CodeChallengeWithDetails,
  codeChallengeWithDetailsSchema,
} from "./code_challenge";
import {
  type CodeVerifier,
  create_code_verifier,
  codeVerifierSchema,
  MAX_PKCE_CODE_VERIFIER_AGE,
  type CodeVerifierWithDetails,
  codeVerifierWithDetailsSchema,
} from "./code_verifier";
import { sha256_digest, sha256_base64url } from "@/sha256_digest";

/**
 * Signature compatible with node:crypto's `timingSafeEqual`. Callers of
 * `doesVerifierMatchChallenge` inject this so that this package doesn't need
 * to import `node:crypto` itself — which would break browser bundlers
 * (Cypress webpack, etc.) that also consume this class for client-side
 * verifier/challenge generation.
 */
export type TimingSafeEqualFn = (a: Uint8Array, b: Uint8Array) => boolean;

interface CheckWhetherVerifierMatchesChallengeInputOptions {
  input_code_verifier: string;
  saved_code_challenge: string;
  challenge_time: number;
  /**
   * Timing-safe byte comparator. Server-side callers should pass
   * `timingSafeEqual` from `node:crypto`.
   */
  timingSafeEqual: TimingSafeEqualFn;
}

// Handles the creation of a PKCE code verifier and challenge
export class PKCE_ProofKeyManager {
  private code_verifier: Partial<CodeVerifierWithDetails> & {
    challenge_time: number;
    code_verifier: CodeVerifier;
  };

  public static createCodeVerifier(
    challenge_time?: number,
  ): CodeVerifierWithDetails {
    return create_code_verifier({ challenge_time });
  }

  public static async createCodeChallenge(
    code_verifier: CodeVerifierWithDetails,
  ): Promise<CodeChallengeWithDetails> {
    const createCodeChallengeOptions: CreateCodeChallengeInputOptions = {
      code_verifier,
      sha256_digest: sha256_digest,
    };
    const code_challenge: CodeChallengeWithDetails =
      await create_code_challenge(createCodeChallengeOptions);
    return code_challenge;
  }

  // Create a new PKCE_ProofKeyManager instance
  // See PKCE_ProofKeyManager.createCodeVerifier to pre-generate a code_verifier
  public constructor(
    code_verifier?: Partial<CodeVerifierWithDetails> & {
      challenge_time: number;
      code_verifier: CodeVerifier;
    },
  ) {
    if (typeof code_verifier === "undefined") {
      // If no code_verifier is provided, create a new one
      this.code_verifier = PKCE_ProofKeyManager.createCodeVerifier(Date.now());
    } else {
      // If a code_verifier is provided, ensure it satisfies the CodeVerifier interface
      code_verifier satisfies object;

      const verifier: CodeVerifier | undefined = code_verifier.code_verifier;
      if (!verifier || typeof code_verifier.code_verifier !== "string") {
        throw new Error(
          "ProofKeyManager did not receive a code verifier to start PKCE flow!",
        );
      }

      const challenge_time = code_verifier.challenge_time;
      if (typeof challenge_time !== "number") {
        throw new Error(
          "Did not receive a 'challenge_time' associated with code verifier!",
        );
      }

      this.code_verifier = {
        ...code_verifier,
        code_verifier: verifier,
        challenge_time,
      };
    }
  }

  public async getCodeChallenge(): Promise<CodeChallengeWithDetails> {
    const code_verifier: Partial<CodeVerifierWithDetails> | undefined =
      this.code_verifier;
    if (!code_verifier) {
      throw new Error(
        "Input code verifier not found within PKCE_ProofKeyManager!",
      );
    }
    if (!code_verifier.code_verifier) {
      throw new Error("Code verifier not found!");
    }
    if (typeof code_verifier.challenge_time !== "number") {
      throw new Error("Code challenge time not found!");
    }
    const codeChallengeOptions: CreateCodeChallengeInputOptions = {
      code_verifier: {
        ...code_verifier,
        code_verifier: code_verifier.code_verifier,
        challenge_time: code_verifier.challenge_time,
      },
      sha256_digest: sha256_digest,
    };
    return await create_code_challenge(codeChallengeOptions);
  }

  public get challenge_time(): number {
    if (!this.code_verifier.challenge_time) {
      throw new Error("challenge_time not set");
    }
    if (typeof this.code_verifier.challenge_time !== "number") {
      throw new Error("Invalid challenge_time");
    }
    return this.code_verifier.challenge_time;
  }

  public get expiry_time(): number {
    if (!this.code_verifier.expires_at) {
      throw new Error("expires_at not set");
    }
    return this.code_verifier.expires_at;
  }

  public static get codeVerifierSchema() {
    return codeVerifierSchema;
  }

  public static get codeVerifierWithDetailsSchema() {
    return codeVerifierWithDetailsSchema;
  }

  public static get codeChallengeSchema() {
    return codeChallengeSchema;
  }

  public static get codeChallengeWithOptionsSchema() {
    return codeChallengeWithDetailsSchema;
  }

  public static get max_age(): number {
    return MAX_PKCE_CODE_VERIFIER_AGE;
  }

  public static get codeChallengeMethod(): typeof code_challenge_method {
    return code_challenge_method;
  }

  public static isValidCodeVerifierFormat(
    maybe_code_verifier: unknown,
  ): maybe_code_verifier is CodeVerifierWithDetails {
    return PKCE_ProofKeyManager.codeVerifierWithDetailsSchema.safeParse(
      maybe_code_verifier,
    ).success;
  }

  public static isValidCodeChallengeFormat(
    maybe_code_challenge: unknown,
  ): maybe_code_challenge is CodeChallengeWithDetails {
    return this.codeChallengeWithOptionsSchema.safeParse(maybe_code_challenge)
      .success;
  }

  /**
   *
   * @name doesVerifierMatchChallenge
   * @param input_code_verifier Frontend client sends code_verifier, to prove they created the initial code_challenge
   * @param saved_code_challenge The code_challenge that was generated and associated with the user's authorization code
   * @returns sha256_hash(input_code_verifier) === saved_code_challenge
   */
  public static async doesVerifierMatchChallenge(
    opts: CheckWhetherVerifierMatchesChallengeInputOptions,
  ): Promise<boolean> {
    const {
      input_code_verifier,
      saved_code_challenge,
      challenge_time,
      timingSafeEqual,
    } = opts;

    if (typeof input_code_verifier !== "string" || !input_code_verifier) {
      throw new Error("Input code verifier is not a string");
    }

    if (typeof timingSafeEqual !== "function") {
      throw new Error(
        "PKCE_ProofKeyManager.doesVerifierMatchChallenge requires a `timingSafeEqual` function (e.g. the one from node:crypto) to perform a constant-time comparison.",
      );
    }

    const parsed_input_verifier =
      PKCE_ProofKeyManager.codeVerifierSchema.safeParse(input_code_verifier);
    if (!parsed_input_verifier.success) {
      console.error(
        "Invalid input code verifier: ",
        parsed_input_verifier.error,
      );
      return false;
    }

    try {
      // Put the input code verifier through the same process
      // that (should have) created the initial code_challenge
      const pkce_flow = new PKCE_ProofKeyManager({
        code_verifier: input_code_verifier,
        challenge_time,
      });

      const legacy_challenge: CodeChallengeWithDetails =
        await pkce_flow.getCodeChallenge();

      // Standard RFC 7636 clients (OIDC RPs) send the strict base64url
      // encoding of the digest; SchemaVaults SDK clients send the legacy
      // encoding (see sha256_digest), where `+`, `/`, and the `=` padding
      // are all replaced with `_`. Both are deterministic encodings of
      // the same SHA-256 digest, so accepting either does not weaken the
      // proof — the verifier still has to hash to the stored challenge.
      const standard_challenge: string =
        await sha256_base64url(input_code_verifier);

      // Timing-safe comparison using the caller-provided function.
      // The caller is responsible for supplying a constant-time comparator;
      // accepting it as an argument keeps this module free of any runtime
      // dependency on node:crypto, so it can be bundled for browsers (for
      // createCodeVerifier/createCodeChallenge) without bundler errors.
      //
      // Challenges are compared as raw UTF-8 strings, NOT base64-decoded:
      // the legacy encoding replaces the `=` padding with `_`, so decoding
      // it is lossy and yields a different byte length than the digest.
      const encoder = new TextEncoder();
      const savedBytes: Uint8Array = encoder.encode(saved_code_challenge);
      const matchesSavedChallenge = (candidate: string): boolean => {
        const candidateBytes: Uint8Array = encoder.encode(candidate);
        if (candidateBytes.length !== savedBytes.length) {
          return false;
        }
        return timingSafeEqual(candidateBytes, savedBytes);
      };

      // Evaluate both encodings unconditionally (no short-circuit) so the
      // comparison cost does not depend on which encoding matched.
      const legacy_match: boolean = matchesSavedChallenge(
        legacy_challenge.code_challenge,
      );
      const standard_match: boolean = matchesSavedChallenge(standard_challenge);
      return legacy_match || standard_match;
    } catch (e: unknown) {
      console.error(e);
      return false;
    }
  }
}
