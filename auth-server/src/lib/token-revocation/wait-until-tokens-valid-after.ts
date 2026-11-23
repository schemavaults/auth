/**
 * The longest {@link waitUntilTokensValidAfter} waits. A watermark set by
 * `tokensValidAfterRevokingAt()` begins less than a second from the moment it
 * was computed; anything further away (a clock that moved, a bad value) is
 * not waited for.
 */
export const MAX_TOKENS_VALID_AFTER_WAIT_MS = 1_000 as const;

export interface WaitUntilTokensValidAfterDependencies {
  /** Unix milliseconds. */
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

function sleepFor(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Waits until the second a `tokens_valid_after` watermark names has begun,
 * at most {@link MAX_TOKENS_VALID_AFTER_WAIT_MS}, and returns how long it
 * waited (ms).
 *
 * A revocation sets the watermark past its own second, which revokes every
 * token minted in that second, including one minted for a sign-in that
 * follows the revocation within the same second. A handler that revokes a
 * user's tokens and expects the user to sign in again (the password reset
 * confirm) calls this before it answers, so that sign-in mints tokens whose
 * `iat` is at or past the watermark.
 */
export async function waitUntilTokensValidAfter(
  tokens_valid_after: number,
  { now = Date.now, sleep = sleepFor }: WaitUntilTokensValidAfterDependencies = {},
): Promise<number> {
  if (!Number.isFinite(tokens_valid_after) || tokens_valid_after <= 0) {
    return 0;
  }
  const remaining_ms: number = tokens_valid_after * 1000 - now();
  if (!(remaining_ms > 0) || remaining_ms > MAX_TOKENS_VALID_AFTER_WAIT_MS) {
    return 0;
  }
  await sleep(remaining_ms);
  return remaining_ms;
}

export default waitUntilTokensValidAfter;
