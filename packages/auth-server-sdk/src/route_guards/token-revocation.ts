import type { AuthTokenTypes } from "@schemavaults/auth-common";

/**
 * The revocation-relevant claims of one token that verified successfully
 * while resolving a route guard's user. Every token in the request that
 * decrypted and verified is reported (they are guaranteed to belong to the
 * same user), so a hook can reject the request if ANY presented credential
 * has been revoked.
 */
export interface DecodedTokenClaims {
  /** Token identifier (`jti`). `null` for legacy tokens minted before jti tracking. */
  jti: string | null;
  /** Issued-at (`iat`) in unix **seconds**, as produced by jose's `setIssuedAt`. */
  iat: number;
  /** The user the token was issued for (`uid`). */
  uid: string;
  /** Whether this was presented as an access or a refresh token. */
  type: AuthTokenTypes;
  /** Where the token came from (cookie name, header, ...), for diagnostics. */
  sourceHint?: string;
}

/**
 * Optional revocation check consulted by the route guards AFTER a token has
 * been cryptographically verified. Return `true` to reject the token as
 * revoked (explicit `jti` revocation after logout, or an `iat` older than a
 * per-user `tokens_valid_after` watermark bumped by a password reset).
 *
 * The auth server always supplies one; resource servers may omit it and keep
 * the claims-only fast path. A hook that throws is treated as "revoked"
 * (fail closed) — a revocation store outage must never widen access.
 */
export type IsTokenRevokedFn = (
  token: DecodedTokenClaims,
) => Promise<boolean> | boolean;

export interface EvaluateTokenRevocationResult {
  revoked: boolean;
  /** The claims of the first token that was reported revoked (or errored). */
  token?: DecodedTokenClaims;
  /** Set when the hook threw and the request was failed closed. */
  error?: unknown;
}

/**
 * Runs `is_token_revoked` over every verified token. Reports revoked as soon
 * as one token is revoked; a thrown error is reported as revoked too.
 */
export async function evaluateTokenRevocation(
  is_token_revoked: IsTokenRevokedFn,
  tokens: readonly DecodedTokenClaims[],
  debug: boolean = false,
): Promise<EvaluateTokenRevocationResult> {
  for (const token of tokens) {
    let revoked: boolean;
    try {
      revoked = (await is_token_revoked(token)) === true;
    } catch (e: unknown) {
      console.error(
        `[evaluateTokenRevocation] 'is_token_revoked' threw for ${token.type} token (jti='${token.jti ?? "none"}', uid='${token.uid}'); failing closed:`,
        e,
      );
      return { revoked: true, token, error: e };
    }
    if (revoked) {
      if (debug) {
        console.warn(
          `[evaluateTokenRevocation] ${token.type} token (jti='${token.jti ?? "none"}', iat=${token.iat}, uid='${token.uid}', source='${token.sourceHint ?? "unknown"}') has been revoked`,
        );
      }
      return { revoked: true, token };
    }
  }
  return { revoked: false };
}

export default evaluateTokenRevocation;
