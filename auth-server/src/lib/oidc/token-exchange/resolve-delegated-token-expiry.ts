// NOT server-only: a pure function (unit tested under `bun test`).

import type { OidcTokenRequestError } from "@/lib/oidc/token-request-extensions/oidc-token-request-error";

/**
 * The shortest life a delegated token is minted for. A subject token closer
 * to its expiry than this is refused (`invalid_request`): the agent could
 * hardly use what it would get, and the client should exchange a fresher
 * access token of the user's (the refresh grant mints one). The margin also
 * keeps the delegated token's `exp` safely after its own issuance second.
 */
export const MIN_DELEGATED_TOKEN_LIFETIME_SECONDS = 30 as const;

export interface ResolveDelegatedTokenExpiryOptions {
  /** The subject token's `exp`, in unix SECONDS (the JWT NumericDate). */
  subject_token_exp: number;
  /** Unix milliseconds; defaults to the current time. */
  now?: number;
}

export type ResolvedDelegatedTokenExpiry =
  | {
      ok: true;
      /** When the delegated token expires, in unix milliseconds. */
      expires_at: number;
    }
  | { ok: false; error: OidcTokenRequestError };

/**
 * When a delegated token expires: exactly when its subject token does. A
 * delegated token never holds more than the token it was exchanged for, and
 * that includes time: without the cap, exchanging a token with a minute left
 * would hand the agent a full access-token lifetime, and exchanging again
 * just before each expiry would keep an agent going without the user's own
 * token ever being renewed. To keep an agent working longer, the client
 * renews the user's access token (refresh grant) and exchanges the new one,
 * which only works while the user's own grant is live.
 *
 * Refuses (`invalid_request`, RFC 8693 §2.2.2, like every other subject
 * token failure) a subject token with less than
 * {@link MIN_DELEGATED_TOKEN_LIFETIME_SECONDS} left.
 */
export function resolveDelegatedTokenExpiry({
  subject_token_exp,
  now = Date.now(),
}: ResolveDelegatedTokenExpiryOptions): ResolvedDelegatedTokenExpiry {
  const expires_at: number = subject_token_exp * 1000;
  if (!Number.isFinite(expires_at) || expires_at - now < MIN_DELEGATED_TOKEN_LIFETIME_SECONDS * 1000) {
    return {
      ok: false,
      error: {
        error: "invalid_request",
        error_description: `The 'subject_token' expires in less than ${MIN_DELEGATED_TOKEN_LIFETIME_SECONDS} seconds; exchange a fresh access token of the user's.`,
      },
    };
  }
  return { ok: true, expires_at };
}

export default resolveDelegatedTokenExpiry;
