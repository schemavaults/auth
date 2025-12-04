import { create_code_challenge, codeChallengeSchema, code_challenge_method, type CreateCodeChallengeInputOptions, CodeChallengeWithDetails, codeChallengeWithDetailsSchema } from "./code_challenge";
import { type CodeVerifier, create_code_verifier, codeVerifierSchema, MAX_PKCE_CODE_VERIFIER_AGE, CodeVerifierWithDetails, codeVerifierWithDetailsSchema } from "./code_verifier";
import { sha256_digest } from "./sha256_digest";

interface CheckWhetherVerifierMatchesChallengeInputOptions {
  input_code_verifier: string;
  saved_code_challenge: string;
  challenge_time: number;
}

// Handles the creation of a PKCE code verifier and challenge
export class PKCE_ProofKeyManager {
  private code_verifier: Partial<CodeVerifierWithDetails> & { challenge_time: number, code_verifier: CodeVerifier };

  public static createCodeVerifier(challenge_time?: number): CodeVerifierWithDetails {
    return create_code_verifier({ challenge_time });
  }

  public static async createCodeChallenge(code_verifier: CodeVerifierWithDetails): Promise<CodeChallengeWithDetails> {
    const createCodeChallengeOptions: CreateCodeChallengeInputOptions = {
      code_verifier,
      sha256_digest: sha256_digest
    }
    const code_challenge: CodeChallengeWithDetails = await create_code_challenge(createCodeChallengeOptions);
    return code_challenge;
  }

  // Create a new PKCE_ProofKeyManager instance
  // See PKCE_ProofKeyManager.createCodeVerifier to pre-generate a code_verifier
  public constructor(code_verifier?: Partial<CodeVerifierWithDetails> & { challenge_time: number, code_verifier: CodeVerifier }) {
    if (typeof code_verifier === 'undefined') { // If no code_verifier is provided, create a new one
      this.code_verifier = PKCE_ProofKeyManager.createCodeVerifier(Date.now());
    } else { // If a code_verifier is provided, ensure it satisfies the CodeVerifier interface
      code_verifier satisfies object;

      const verifier: CodeVerifier | undefined = code_verifier.code_verifier;
      if (!verifier || typeof code_verifier.code_verifier !== 'string') {
        throw new Error("ProofKeyManager did not receive a code verifier to start PKCE flow!")
      }

      const challenge_time = code_verifier.challenge_time;
      if (typeof challenge_time !== 'number') {
        throw new Error("Did not receive a 'challenge_time' associated with code verifier!");
      }

      this.code_verifier = {
        ...code_verifier,
        code_verifier: verifier,
        challenge_time
      }
    }
  }

  public async getCodeChallenge(): Promise<CodeChallengeWithDetails> {
    const code_verifier: Partial<CodeVerifierWithDetails> | undefined = this.code_verifier;
    if (!code_verifier) {
      throw new Error("Input code verifier not found within PKCE_ProofKeyManager!")
    }
    if (!code_verifier.code_verifier) {
      throw new Error("Code verifier not found!")
    }
    if (typeof code_verifier.challenge_time !== 'number') {
      throw new Error("Code challenge time not found!")
    }
    const codeChallengeOptions: CreateCodeChallengeInputOptions = {
      code_verifier: {
        ...code_verifier,
        code_verifier: code_verifier.code_verifier,
        challenge_time: code_verifier.challenge_time
      },
      sha256_digest: sha256_digest
    };
    return await create_code_challenge(codeChallengeOptions);
  }

  public get challenge_time(): number {
    if (!this.code_verifier.challenge_time) {
      throw new Error('challenge_time not set');
    }
    if (typeof this.code_verifier.challenge_time !== 'number') {
      throw new Error('Invalid challenge_time');
    }
    return this.code_verifier.challenge_time;
  }

  public get expiry_time(): number {
    if (!this.code_verifier.expires_at) {
      throw new Error('expires_at not set');
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
    return codeChallengeWithDetailsSchema
  }

  public static get max_age(): number {
    return MAX_PKCE_CODE_VERIFIER_AGE;
  }

  public static get codeChallengeMethod(): typeof code_challenge_method {
    return code_challenge_method;
  }

  public static isValidCodeVerifierFormat(maybe_code_verifier: unknown): maybe_code_verifier is CodeVerifierWithDetails {
    return ( PKCE_ProofKeyManager.codeVerifierWithDetailsSchema.safeParse(maybe_code_verifier)).success
  }

  public static isValidCodeChallengeFormat(maybe_code_challenge: unknown): maybe_code_challenge is CodeChallengeWithDetails {
    return this.codeChallengeWithOptionsSchema.safeParse(maybe_code_challenge).success;
  }

  /**
  *
  * @name doesVerifierMatchChallenge
  * @param input_code_verifier Frontend client sends code_verifier, to prove they created the initial code_challenge
  * @param saved_code_challenge The code_challenge that was generated and associated with the user's authorization code
  * @returns sha256_hash(input_code_verifier) === saved_code_challenge
  */
  public static async doesVerifierMatchChallenge(opts: CheckWhetherVerifierMatchesChallengeInputOptions): Promise<boolean> {
    const { input_code_verifier, saved_code_challenge, challenge_time } = opts;

    if (typeof input_code_verifier !== 'string' || !input_code_verifier) {
      throw new Error("Input code verifier is not a string");
    }

    const parsed_input_verifier = PKCE_ProofKeyManager.codeVerifierSchema.safeParse(input_code_verifier)
    if (!parsed_input_verifier.success) {
      console.error("Invalid input code verifier: ", parsed_input_verifier.error);
      return false;
    }

    try {
      // Put the input code verifier through the same process
      // that (should have) created the initial code_challenge
      const pkce_flow = new PKCE_ProofKeyManager({
        code_verifier: input_code_verifier,
        challenge_time
      });

      const generated_challenge: CodeChallengeWithDetails = await pkce_flow.getCodeChallenge();

      const saved_challenge: Partial<CodeChallengeWithDetails> = {
        code_challenge: saved_code_challenge,
        code_challenge_method
      };

      return generated_challenge.code_challenge === saved_challenge.code_challenge;
    } catch (e: unknown) {
      console.error(e);
      return false;
    }
  }
}
