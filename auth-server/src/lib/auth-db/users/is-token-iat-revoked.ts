/**
 * The `tokens_valid_after` watermark a disabled account is pinned to for as
 * long as it stays disabled (see set-user-disabled.ts). It is later than any
 * `iat` a token can carry, so EVERY token of the account — whenever it was
 * minted, including one minted by a request that raced the disable — is
 * revoked at every surface that consults the watermark (route guards, the
 * refresh and authorization_code grants, introspection). Re-enabling the
 * account moves the watermark back down to the re-enable time.
 *
 * `Number.MAX_SAFE_INTEGER` round-trips exactly through the BIGINT column
 * and `parseInt`. Migration 00041 writes the same literal.
 */
export const DISABLED_USER_TOKENS_VALID_AFTER: number = Number.MAX_SAFE_INTEGER;

/**
 * The `tokens_valid_after` watermark that revokes every token minted up to
 * and including the second of `now_ms` (unix milliseconds): the FIRST whole
 * second whose tokens are valid, `floor(now_ms / 1000) + 1`.
 *
 * `iat` only has whole seconds, so a token minted in the same second as the
 * revoking event cannot be told apart from one minted just after it. A
 * revocation therefore takes the whole second: setting the watermark to
 * `floor(now_ms / 1000)` instead would let a token minted in that second
 * (say, by an attacker refreshing a stolen token in a loop while the
 * password is reset) outlive the revocation. The caller has to make sure a
 * legitimate sign-in that follows the revocation lands in a later second;
 * the password reset confirm answers only once this second has begun
 * (`waitUntilTokensValidAfter`).
 */
export function tokensValidAfterRevokingAt(now_ms: number = Date.now()): number {
  if (typeof now_ms !== "number" || !Number.isFinite(now_ms) || now_ms <= 0) {
    throw new TypeError("Invalid now_ms: expected a positive finite number");
  }
  return Math.floor(now_ms / 1000) + 1;
}

/**
 * Pure decision: given a JWT `iat` claim (unix seconds) and the user's
 * `tokens_valid_after` watermark (also unix seconds), report whether the
 * token has been globally revoked by an operation that bumped the
 * watermark (a password reset, or the account being disabled).
 *
 * The watermark is the first second whose tokens are valid, so a token is
 * revoked when its `iat` is strictly less than it. Revoking operations set
 * it past their own second (`tokensValidAfterRevokingAt`), so a token
 * minted in the same second as the revocation is revoked too; re-enabling
 * an account sets it to the re-enable second, whose tokens it keeps valid.
 * Watermark `<= 0` means "never set", so no tokens are
 * revoked by this mechanism. Non-finite or missing `iat` returns false
 * (the caller already rejected such tokens earlier in the pipeline).
 */
export function isTokenIatRevoked(
  iat: number | undefined,
  tokens_valid_after: number,
): boolean {
  if (
    typeof tokens_valid_after !== "number" ||
    !Number.isFinite(tokens_valid_after) ||
    tokens_valid_after <= 0
  ) {
    return false;
  }
  if (typeof iat !== "number" || !Number.isFinite(iat)) return false;
  return iat < tokens_valid_after;
}

export default isTokenIatRevoked;
