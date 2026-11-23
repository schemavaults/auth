import "server-only";

import type Redis from "ioredis";
import type { NextResponse } from "next/server";
import {
  checkRateLimitCount,
  incrementRateLimitCounter,
  MFA_PROOF_FAILURE_LOCKOUT,
  rateLimitResponse,
  type RateLimitResult,
} from "@/lib/rate-limit";

/**
 * The per-account cap on failed MFA proofs (`MFA_PROOF_FAILURE_LOCKOUT`),
 * shared by every endpoint that checks one: the login challenge and the
 * step-up proofs (recovery code regeneration, TOTP / passkey removal).
 * A 6-digit TOTP code is guessable without it.
 *
 * Call `mfaProofFailureLockoutResponse()` before evaluating the proof and
 * answer with its response when there is one; call `recordMfaProofFailure()`
 * after a proof is refused. A correct proof is not counted.
 */
export async function mfaProofFailureLockoutResponse(
  redis: Redis,
  uid: string,
): Promise<NextResponse | null> {
  const result: RateLimitResult = await checkRateLimitCount(redis, MFA_PROOF_FAILURE_LOCKOUT, { uid });
  return result.allowed ? null : rateLimitResponse(result);
}

/** Counts one refused MFA proof against the account's budget. */
export async function recordMfaProofFailure(redis: Redis, uid: string): Promise<void> {
  await incrementRateLimitCounter(redis, MFA_PROOF_FAILURE_LOCKOUT, { uid });
}
