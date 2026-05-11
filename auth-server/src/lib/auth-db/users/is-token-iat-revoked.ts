/**
 * Pure decision: given a JWT `iat` claim (unix seconds) and the user's
 * `tokens_valid_after` watermark (also unix seconds), report whether the
 * token has been globally revoked by an operation that bumped the
 * watermark (e.g. a password reset).
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
