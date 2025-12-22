import isCryptoApiAvailable from "@/is_crypto_api_available";
import { z } from "zod";

const MIN_CODE_VERIFIER_LENGTH = 43 as const;
const MAX_CODE_VERIFIER_LENGTH = 1024 as const;

export const MAX_PKCE_CODE_VERIFIER_AGE: number = 1000 * 60 * 60; // 1 hour

export interface CreateCodeVerifierInputOptions {
  challenge_time?: number;
  generateRandomCodeVerifier?: () => string;
  debug?: boolean;
}

function secureContextRandomCharacters(): string {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(512))).toString(
    "base64",
  );
}

function generatePseudoRandomBase64String(): string {
  const randomCodeVerifierLength: number =
    Math.floor(
      Math.random() * (MAX_CODE_VERIFIER_LENGTH - MIN_CODE_VERIFIER_LENGTH + 1),
    ) + MIN_CODE_VERIFIER_LENGTH;
  const clamped_n_chars: number = Math.max(
    MIN_CODE_VERIFIER_LENGTH,
    Math.min(MAX_CODE_VERIFIER_LENGTH, randomCodeVerifierLength),
  );
  const n_chars: number = clamped_n_chars;
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  let result = "";
  for (let i = 0; i < n_chars; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Create code verifier for Oauth2 PKCE
// https://datatracker.ietf.org/doc/html/rfc7636#section-4.1
export function create_code_verifier({
  challenge_time,
  generateRandomCodeVerifier,
  debug = false,
}: CreateCodeVerifierInputOptions): CodeVerifierWithDetails {
  try {
    let code_verifier: string =
      typeof generateRandomCodeVerifier === "function"
        ? generateRandomCodeVerifier()
        : (((): string => {
            if (isCryptoApiAvailable()) {
              return secureContextRandomCharacters();
            } else {
              return generatePseudoRandomBase64String();
            }
          })() satisfies string);
    const base64url_encoded_verifier: string = code_verifier.replace(
      /[^A-Za-z0-9_-]/g,
      "_",
    );

    if (debug) {
      console.log("Created new code_verifier: ", base64url_encoded_verifier);
    }

    if (
      base64url_encoded_verifier.length < MIN_CODE_VERIFIER_LENGTH ||
      base64url_encoded_verifier.length > MAX_CODE_VERIFIER_LENGTH
    ) {
      throw new Error(
        `Invalid code_verifier length: ${base64url_encoded_verifier.length}`,
      );
    }

    const now =
      typeof challenge_time === "number" ? challenge_time : Date.now();

    return {
      code_verifier: base64url_encoded_verifier,
      challenge_time: now,
      expires_at: now + MAX_PKCE_CODE_VERIFIER_AGE - 1,
      max_age: MAX_PKCE_CODE_VERIFIER_AGE,
    } satisfies CodeVerifierWithDetails;
  } catch (e: unknown) {
    console.error("Failed to generate a new code_verifier with crypto: ", e);
    throw new Error("Failed to generate a new code_verifier with crypto");
  }
}

export const codeVerifierSchema = z
  .string()
  .min(MIN_CODE_VERIFIER_LENGTH)
  .max(MAX_CODE_VERIFIER_LENGTH)
  .refine((value) => /^[A-Za-z0-9_-]+$/.test(value), {
    message: `Code verifier is not base64url encoded string`,
  });

export type CodeVerifier = z.infer<typeof codeVerifierSchema>;

export const codeVerifierWithDetailsSchema = z
  .object({
    code_verifier: codeVerifierSchema,
    challenge_time: z.number().nonnegative(),
    expires_at: z.number().nonnegative(),
    max_age: z.number().nonnegative(),
  })
  .required({
    code_verifier: true,
    challenge_time: true,
    expires_at: true,
    max_age: true,
  })
  .strict();

export type CodeVerifierWithDetails = z.infer<
  typeof codeVerifierWithDetailsSchema
>;
