import { z } from "zod";

export const mfaFactorTypes = ["totp", "webauthn"] as const;

export const mfaFactorTypeSchema = z.enum(mfaFactorTypes);

export type MfaFactorType = z.infer<typeof mfaFactorTypeSchema>;

export function isValidMfaFactorType(value: unknown): value is MfaFactorType {
  return mfaFactorTypeSchema.safeParse(value).success;
}
