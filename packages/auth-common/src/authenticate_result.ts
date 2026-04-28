import { z } from "zod";

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

export const authenticateResultSchema = z.discriminatedUnion("kind", [
  authenticatedAuthenticateResultSchema,
  mfaRequiredAuthenticateResultSchema,
  authenticateFailureResultSchema,
]);

export type AuthenticateResult = z.infer<typeof authenticateResultSchema>;
