import { z } from "zod";

const MIN_CODE_VERIFIER_LENGTH = 43 as const;
const MAX_CODE_VERIFIER_LENGTH = 1024 as const;

export const MAX_PKCE_CODE_VERIFIER_AGE: number = 1000 * 60 * 60; // 1 hour

export interface CreateCodeVerifierInputOptions {
  challenge_time?: number;
  generateRandomCodeVerifier?: () => string;
}

function secureContextRandomCharacters(): string {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(512))).toString('base64');
}

// Create code verifier for Oauth2 PKCE
// https://datatracker.ietf.org/doc/html/rfc7636#section-4.1
export function create_code_verifier({ challenge_time, generateRandomCodeVerifier }: CreateCodeVerifierInputOptions): CodeVerifierWithDetails {
  try {
    let code_verifier: string = typeof generateRandomCodeVerifier === 'function' ? generateRandomCodeVerifier() : (
      ((): string => {
        let isCryptoAvailable: boolean = false;
        if (typeof window === 'undefined') {
          // nodejs / bun / non-browser environments should probably have crypto features?
          isCryptoAvailable = true;
        } else {
          if (window.location.protocol === 'https:') {
            isCryptoAvailable = true;
          } else {
            // http context, only availabe on localhost / dev environment
            // test environment might use non-localhost http
            if (/^http:\/\/(localhost|127\.0\.0\.1)/.test(window.location.href)) {
              isCryptoAvailable = true;
            } else {
              isCryptoAvailable = false;
            }
          }
        }

        if (isCryptoAvailable) {
          return secureContextRandomCharacters();
        }

        const generatePseudoRandomBase64String = (): string => {
          const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
          let result = '';
          for (let i = 0; i < 86; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
          }
          return result;
        };

        return generatePseudoRandomBase64String();
      })() satisfies string
    );
    const base64url_encoded_verifier: string = code_verifier.replace(/[^A-Za-z0-9_-]/g, '_');

    if (process.env.NODE_ENV === 'development') {
      console.log("Created new code_verifier: ", base64url_encoded_verifier);
    }

    if (base64url_encoded_verifier.length < MIN_CODE_VERIFIER_LENGTH || base64url_encoded_verifier.length > MAX_CODE_VERIFIER_LENGTH) {
      throw new Error(`Invalid code_verifier length: ${base64url_encoded_verifier.length}`);
    }

    const now = typeof challenge_time === 'number' ? challenge_time : Date.now();

    return {
      code_verifier: base64url_encoded_verifier,
      challenge_time: now,
      expires_at: now + MAX_PKCE_CODE_VERIFIER_AGE - 1,
      max_age: MAX_PKCE_CODE_VERIFIER_AGE
    } satisfies CodeVerifierWithDetails;
  } catch (e: unknown) {
    throw new Error("Failed to generate a new code_verifier with crypto");
  }
}

export const codeVerifierSchema = z.string()
  .min(MIN_CODE_VERIFIER_LENGTH)
  .max(MAX_CODE_VERIFIER_LENGTH)
  .refine(value => /^[A-Za-z0-9_-]+$/.test(value), {
    message: `Code verifier is not base64url encoded string`,
  });

export type CodeVerifier = z.infer<typeof codeVerifierSchema>;

export const codeVerifierWithDetailsSchema = z.object({
  code_verifier: codeVerifierSchema,
  challenge_time: z.number().nonnegative(),
  expires_at: z.number().nonnegative(),
  max_age: z.number().nonnegative()
}).required().strict();

export type CodeVerifierWithDetails = z.infer<typeof codeVerifierWithDetailsSchema>;
