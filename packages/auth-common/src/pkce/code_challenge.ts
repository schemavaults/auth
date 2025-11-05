import { z } from "zod";
import { type CodeVerifierWithDetails, MAX_PKCE_CODE_VERIFIER_AGE, type CodeVerifier } from "./code_verifier";

export const code_challenge_method = 'S256' as const;

export interface CreateCodeChallengeInputOptions {
  code_verifier: Partial<CodeVerifierWithDetails> & { code_verifier: CodeVerifier, challenge_time: number };
  sha256_digest: (code_verifier: string) => Promise<string>;
}

// Create code challenge for Oauth2 PKCE
// https://datatracker.ietf.org/doc/html/rfc7636#section-4.2
export async function create_code_challenge(
  verifier_opts: CreateCodeChallengeInputOptions
): Promise<CodeChallengeWithDetails> {
  if (!verifier_opts.code_verifier) {
    throw new Error("[create_code_challenge] Missing code_verifier");
  }

  const { expires_at, max_age, code_verifier, challenge_time } = verifier_opts.code_verifier;
  code_verifier satisfies CodeVerifier;
  if (typeof expires_at === 'number') {
    if (expires_at < Date.now()) {
      throw new Error("Code verifier has expired");
    }
  }

  if (typeof max_age === 'number' &&  max_age !== MAX_PKCE_CODE_VERIFIER_AGE) {
    throw new Error("Code verifier has invalid max_age");
  }

  const base64url_encoded_hash = await verifier_opts.sha256_digest(code_verifier);

  if (typeof challenge_time !== 'number') {
    throw new Error("'challenge_time' is a required field!");
  }

  return {
    code_challenge: base64url_encoded_hash,
    code_challenge_method,
    challenge_time
  };
}

const MIN_CODE_CHALLENGE_LENGTH = 43 as const;
const MAX_CODE_CHALLENGE_LENGTH = 1024 as const;

export const codeChallengeSchema = z.string()
  .min(MIN_CODE_CHALLENGE_LENGTH)
  .max(MAX_CODE_CHALLENGE_LENGTH)
  .refine(value => /^[A-Za-z0-9_-]+$/.test(value), {
    message: `Code challenge is not base64url encoded string`,
  });

export type CodeChallenge = z.infer<typeof codeChallengeSchema>;

export const codeChallengeWithDetailsSchema = z.object({
  code_challenge: codeChallengeSchema,
  code_challenge_method: z.literal(code_challenge_method),
  challenge_time: z.number().nonnegative()
}).required().strict()

export type CodeChallengeWithDetails = {
  code_challenge: CodeChallenge;
  code_challenge_method: typeof code_challenge_method;
  challenge_time: number;
}
