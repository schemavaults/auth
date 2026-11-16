// The end-user verification code of the device authorization grant
// (RFC 8628 §3.2 `user_code`, §6.1 "User Code Recommendations").
//
// A user code is 8 characters from a base-20 alphabet of upper-case
// consonants: easy to read off a screen and type on a phone, and free of
// vowels so no code spells a word. That is 20^8 ≈ 2^34.6 codes, so with the
// rate limits on the verification page and the codes' short lifetime a guess
// is hopeless (§5.1). It is shown and entered as two groups of four
// ("BCDF-GHJK"); entry is case-insensitive and ignores dashes and spaces.

/** The characters of a user code (RFC 8628 §6.1's base-20 example). */
export const USER_CODE_ALPHABET = "BCDFGHJKLMNPQRSTVWXZ" as const;

/** Number of characters in a user code, without its separator. */
export const USER_CODE_LENGTH = 8 as const;

/** Characters per displayed group ("BCDF-GHJK"). */
export const USER_CODE_GROUP_SIZE = 4 as const;

/** Longest raw input `normalizeUserCode()` looks at. */
export const MAX_USER_CODE_INPUT_LENGTH = 32 as const;

const USER_CODE_REGEX = new RegExp(`^[${USER_CODE_ALPHABET}]{${USER_CODE_LENGTH}}$`);

// Largest multiple of the alphabet size that fits a byte: bytes at or above
// it are discarded so every character is equally likely.
const UNBIASED_BYTE_LIMIT: number =
  Math.floor(256 / USER_CODE_ALPHABET.length) * USER_CODE_ALPHABET.length;

/** Fills a byte array with cryptographically secure random values. */
export type RandomBytesSource = (bytes: Uint8Array) => Uint8Array;

function defaultRandomBytes(bytes: Uint8Array): Uint8Array {
  return crypto.getRandomValues(bytes);
}

/**
 * Generates a new user code, in normalized form (8 characters, no
 * separator). Uses rejection sampling so each character is uniform over the
 * alphabet.
 */
export function generateUserCode(
  randomBytes: RandomBytesSource = defaultRandomBytes,
): string {
  let code = "";
  while (code.length < USER_CODE_LENGTH) {
    const bytes: Uint8Array = randomBytes(new Uint8Array(USER_CODE_LENGTH * 2));
    for (const byte of bytes) {
      if (byte >= UNBIASED_BYTE_LIMIT) continue;
      code += USER_CODE_ALPHABET[byte % USER_CODE_ALPHABET.length];
      if (code.length === USER_CODE_LENGTH) break;
    }
  }
  return code;
}

/** Whether `value` is a user code in normalized form. */
export function isNormalizedUserCode(value: unknown): value is string {
  return typeof value === "string" && USER_CODE_REGEX.test(value);
}

/**
 * Normalizes what a user typed into a user code (RFC 8628 §6.1): upper-cases
 * it and drops dashes and whitespace. Null when the result is not a
 * well-formed user code (wrong length, or a character outside the alphabet),
 * so a typo is caught before any lookup.
 */
export function normalizeUserCode(input: unknown): string | null {
  if (typeof input !== "string" || input.length > MAX_USER_CODE_INPUT_LENGTH) {
    return null;
  }
  const normalized: string = input.toUpperCase().replace(/[\s-]+/g, "");
  return isNormalizedUserCode(normalized) ? normalized : null;
}

/**
 * Formats a user code for display, in groups of four separated by a dash
 * ("BCDF-GHJK"). Accepts any form `normalizeUserCode()` accepts; returns the
 * input unchanged when it is not a user code.
 */
export function formatUserCode(code: string): string {
  const normalized: string | null = normalizeUserCode(code);
  if (normalized === null) {
    return code;
  }
  return `${normalized.slice(0, USER_CODE_GROUP_SIZE)}-${normalized.slice(USER_CODE_GROUP_SIZE)}`;
}
