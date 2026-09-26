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
 * Pure decision: given a JWT `iat` claim (unix seconds) and the user's
 * `tokens_valid_after` watermark (also unix seconds), report whether the
 * token has been globally revoked by an operation that bumped the
 * watermark (a password reset, or the account being disabled).
 *
 * Strict less-than: a token minted in the same second as the watermark
 * is accepted. Watermark `<= 0` means "never set", so no tokens are
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
