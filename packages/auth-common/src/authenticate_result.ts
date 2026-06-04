import { z } from "zod";
import { mfaFactorTypeSchema } from "./mfa/mfa-factor-type";

export const availableMfaFactorSchema = z
  .object({
    factor_id: z.string().uuid(),
    factor_type: mfaFactorTypeSchema,
    last_used_at: z.number().int().positive().nullable(),
  })
  .strict();

export type AvailableMfaFactor = z.infer<typeof availableMfaFactorSchema>;

// Collapse a user's verified factors for the login factor picker: every
// passkey folds into a single representative `webauthn` entry while all other
// factor types pass through unchanged.
//
// Why: at login the WebAuthn assertion lists *all* of a user's enrolled
// passkeys in `allowCredentials`, and the platform/browser sheet is what lets
// them pick between those passkeys — so rendering one picker row per passkey
// is redundant and undifferentiated (the same "Passkey / Security key" label
// repeated). For a webauthn proof the selected factor_id is advisory:
// evaluateMfaProof resolves the credential the authenticator actually signed
// with, so any enrolled passkey still verifies against the single row.
//
// Order is preserved and the *first* passkey encountered is kept as the
// representative. Callers pass a list already sorted last_used_at DESC NULLS
// LAST, so the survivor is the most-recently-used passkey — keeping the
// picker's "default to most-recently-used factor" behaviour intact.
export function collapseWebauthnFactors(
  factors: AvailableMfaFactor[],
): AvailableMfaFactor[] {
  const collapsed: AvailableMfaFactor[] = [];
  let keptWebauthn = false;
  for (const factor of factors) {
    if (factor.factor_type === "webauthn") {
      if (keptWebauthn) continue;
      keptWebauthn = true;
    }
    collapsed.push(factor);
  }
  return collapsed;
}

export const authenticatedAuthenticateResultSchema = z
  .object({
    kind: z.literal("authenticated"),
    success: z.boolean(),
    message: z.string(),
    authorization_code: z
      .string()
      .min(43, "Authorization code must be at least 43 characters long"),
  })
  .strict();

export type AuthenticatedAuthenticateResult = z.infer<
  typeof authenticatedAuthenticateResultSchema
>;

export const mfaRequiredAuthenticateResultSchema = z
  .object({
    kind: z.literal("mfa_required"),
    success: z.boolean(),
    message: z.string(),
    challenge_id: z.string().uuid(),
    expires_at: z.number().int().positive(),
    available_factors: z.array(availableMfaFactorSchema),
    recovery_codes_available: z.boolean(),
  })
  .strict();

export type MfaRequiredAuthenticateResult = z.infer<
  typeof mfaRequiredAuthenticateResultSchema
>;

export const authenticateFailureResultSchema = z
  .object({
    kind: z.literal("failure"),
    success: z.boolean(),
    message: z.string(),
  })
  .strict();

export type AuthenticateFailureResult = z.infer<
  typeof authenticateFailureResultSchema
>;

// Returned by /api/auth/mfa/verify with HTTP 410 when an in-flight MFA
// challenge has been invalidated — either by exhausting the per-challenge
// attempt cap or by expiring (TTL elapsed). Distinct from `failure` so
// clients can navigate the user back to the login page rather than letting
// them retry against a key that no longer exists in Redis.
export const challengeExpiredAuthenticateResultSchema = z
  .object({
    kind: z.literal("challenge_expired"),
    success: z.boolean(),
    message: z.string(),
  })
  .strict();

export type ChallengeExpiredAuthenticateResult = z.infer<
  typeof challengeExpiredAuthenticateResultSchema
>;

export const authenticateResultSchema = z.discriminatedUnion("kind", [
  authenticatedAuthenticateResultSchema,
  mfaRequiredAuthenticateResultSchema,
  authenticateFailureResultSchema,
  challengeExpiredAuthenticateResultSchema,
]);

export type AuthenticateResult = z.infer<typeof authenticateResultSchema>;
