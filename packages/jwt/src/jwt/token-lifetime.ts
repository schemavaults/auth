import type { AuthTokenTypes } from "@schemavaults/auth-common";
import { getExpiryTime } from "./expiry";

/**
 * Resolves the `expires_at` option of token generation: when an ACCESS token
 * must expire before its usual lifetime (e.g. a delegated token, which never
 * outlives the user's token it was exchanged for), the JWT `exp` claim to
 * set, in unix SECONDS, and the matching expiry in milliseconds for the
 * returned token object. Returns undefined when no `expires_at` was given:
 * the token keeps its type's default lifetime.
 *
 * `expires_at` (unix milliseconds) is floored to whole seconds, like every
 * JWT NumericDate, and capped at the type's default expiry: it can only
 * shorten a token's life, never extend it (decoders bound a token's age by
 * that default anyway). Every decoder, whatever its version, refuses a token
 * once its `exp` has passed (jose verifies `exp` on decryption), so a shorter
 * lifetime needs no opt-in from resource servers.
 *
 * @throws {Error} on a refresh token: refresh tokens keep their lifetime.
 * @throws {TypeError} when `expires_at` is not a finite number, or is not
 * at least one second after `iat` (the token would be born expired).
 */
export function resolveGeneratedTokenExpiry(
  type: AuthTokenTypes,
  iat: number,
  expires_at: number | undefined,
): { exp_seconds: number; expires_at: number } | undefined {
  if (expires_at === undefined) {
    return undefined;
  }
  if (type !== "access") {
    throw new Error("Only access tokens may be given a shorter lifetime ('expires_at')!");
  }
  if (typeof expires_at !== "number" || !Number.isFinite(expires_at)) {
    throw new TypeError("Invalid 'expires_at': expected unix milliseconds");
  }

  const default_exp_seconds: number = Math.floor(getExpiryTime(type, iat) / 1000);
  const exp_seconds: number = Math.min(Math.floor(expires_at / 1000), default_exp_seconds);
  if (exp_seconds <= Math.floor(iat / 1000)) {
    throw new TypeError("Invalid 'expires_at': the token would expire before it is issued");
  }
  return { exp_seconds, expires_at: exp_seconds * 1000 };
}
