import { z } from "zod";
import { appIdSchema } from "@schemavaults/app-definitions";
import { availableMfaFactorSchema } from "../authenticate_result";

export const totpCodeSchema = z
  .string()
  .regex(/^\d{6}$/u, "TOTP code must be exactly 6 digits");

export const recoveryCodeSchema = z
  .string()
  .min(8)
  .max(64);

export const mfaVerifyBodySchema = z
  .object({
    challenge_id: z.string().uuid(),
    client_app_id: appIdSchema,
    proof: z.discriminatedUnion("type", [
      z
        .object({
          type: z.literal("totp"),
          factor_id: z.string().uuid(),
          code: totpCodeSchema,
        })
        .strict(),
      z
        .object({ type: z.literal("recovery_code"), recovery_code: recoveryCodeSchema })
        .strict(),
    ]),
  })
  .strict();

export type MfaVerifyBody = z.infer<typeof mfaVerifyBodySchema>;

export const mfaEnrollResponseSchema = z
  .object({
    factor_id: z.string().uuid(),
    factor_type: z.literal("totp"),
    otpauth_url: z.string().url(),
    qr_code_data_url: z.string().min(1),
    secret: z.string().min(16),
  })
  .strict();

export type MfaEnrollResponse = z.infer<typeof mfaEnrollResponseSchema>;

export const mfaVerifyEnrollmentBodySchema = z
  .object({
    factor_id: z.string().uuid(),
    code: totpCodeSchema,
  })
  .strict();

export type MfaVerifyEnrollmentBody = z.infer<
  typeof mfaVerifyEnrollmentBodySchema
>;

export const mfaVerifyEnrollmentResponseSchema = z
  .object({
    success: z.literal(true),
    recovery_codes: z.array(recoveryCodeSchema).min(1),
  })
  .strict();

export type MfaVerifyEnrollmentResponse = z.infer<
  typeof mfaVerifyEnrollmentResponseSchema
>;

export const mfaStatusResponseSchema = z
  .object({
    enabled: z.boolean(),
    factor_id: z.string().uuid().optional(),
    factor_type: z.literal("totp").optional(),
    verified_at: z.number().int().positive().optional(),
    recovery_codes_remaining: z.number().int().nonnegative().optional(),
  })
  .strict();

export type MfaStatusResponse = z.infer<typeof mfaStatusResponseSchema>;

export const mfaCodeOnlyBodySchema = z
  .object({
    code: totpCodeSchema,
  })
  .strict();

export type MfaCodeOnlyBody = z.infer<typeof mfaCodeOnlyBodySchema>;

// Shape of the MFA challenge factor list that the login form stashes in
// sessionStorage (keyed by challenge_id) so the downstream MFA challenge
// page can render the factor picker without a second server round-trip.
// Mirrors the `available_factors` + `recovery_codes_available` fields the
// server already includes in the `mfa_required` login response.
export const mfaChallengeFactorsPayloadSchema = z
  .object({
    available_factors: z.array(availableMfaFactorSchema),
    recovery_codes_available: z.boolean(),
  })
  .strict();

export type MfaChallengeFactorsPayload = z.infer<
  typeof mfaChallengeFactorsPayloadSchema
>;
