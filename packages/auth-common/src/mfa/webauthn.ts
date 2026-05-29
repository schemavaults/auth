import { z } from "zod";

// WebAuthn ceremony payloads exchanged between the browser and the auth
// server. The browser uses @simplewebauthn/browser to produce these and
// the server uses @simplewebauthn/server to verify them; the heavy lifting
// (signature checks, challenge binding, RP-ID/origin validation) lives in
// those libraries. These schemas therefore only assert that the payloads
// are structurally well-formed JSON of the expected shape — verification is
// delegated, not duplicated here. `.passthrough()` keeps forward-compat with
// fields newer @simplewebauthn versions may add.

// Mirrors @simplewebauthn/browser's RegistrationResponseJSON.
export const webauthnRegistrationResponseSchema = z
  .object({
    id: z.string().min(1),
    rawId: z.string().min(1),
    response: z.object({}).passthrough(),
    authenticatorAttachment: z.string().optional(),
    clientExtensionResults: z.object({}).passthrough().optional(),
    type: z.string().min(1),
  })
  .passthrough();

export type WebauthnRegistrationResponse = z.infer<
  typeof webauthnRegistrationResponseSchema
>;

// Mirrors @simplewebauthn/browser's AuthenticationResponseJSON.
export const webauthnAuthenticationResponseSchema = z
  .object({
    id: z.string().min(1),
    rawId: z.string().min(1),
    response: z.object({}).passthrough(),
    authenticatorAttachment: z.string().optional(),
    clientExtensionResults: z.object({}).passthrough().optional(),
    type: z.string().min(1),
  })
  .passthrough();

export type WebauthnAuthenticationResponse = z.infer<
  typeof webauthnAuthenticationResponseSchema
>;

// Optional human-friendly label a user may give a passkey ("MacBook
// Touch ID", "YubiKey 5C"). Kept short and trimmed.
export const webauthnLabelSchema = z
  .string()
  .trim()
  .min(1)
  .max(64);

// Response from POST /api/user/mfa/webauthn/options — the server-issued
// PublicKeyCredentialCreationOptionsJSON plus the pending factor_id the
// enrollment will be confirmed against.
export const webauthnEnrollOptionsResponseSchema = z
  .object({
    factor_id: z.string().uuid(),
    // PublicKeyCredentialCreationOptionsJSON — opaque to us, handed to the
    // browser verbatim.
    options: z.object({}).passthrough(),
  })
  .strict();

export type WebauthnEnrollOptionsResponse = z.infer<
  typeof webauthnEnrollOptionsResponseSchema
>;

// Body for POST /api/user/mfa/webauthn/verify-enrollment.
export const webauthnVerifyEnrollmentBodySchema = z
  .object({
    factor_id: z.string().uuid(),
    label: webauthnLabelSchema.optional(),
    attestation: webauthnRegistrationResponseSchema,
  })
  .strict();

export type WebauthnVerifyEnrollmentBody = z.infer<
  typeof webauthnVerifyEnrollmentBodySchema
>;

// Response from POST /api/auth/mfa/webauthn/options — the server-issued
// PublicKeyCredentialRequestOptionsJSON for an in-flight login challenge.
export const webauthnAuthenticationOptionsResponseSchema = z
  .object({
    // PublicKeyCredentialRequestOptionsJSON — opaque to us.
    options: z.object({}).passthrough(),
  })
  .strict();

export type WebauthnAuthenticationOptionsResponse = z.infer<
  typeof webauthnAuthenticationOptionsResponseSchema
>;

// A single enrolled passkey as surfaced to the account settings UI.
export const webauthnCredentialSummarySchema = z
  .object({
    factor_id: z.string().uuid(),
    label: z.string().nullable(),
    created_at: z.number().int().positive(),
    last_used_at: z.number().int().positive().nullable(),
  })
  .strict();

export type WebauthnCredentialSummary = z.infer<
  typeof webauthnCredentialSummarySchema
>;

// Response from GET /api/user/mfa/webauthn — the user's enrolled passkeys.
export const webauthnCredentialListResponseSchema = z
  .object({
    credentials: z.array(webauthnCredentialSummarySchema),
  })
  .strict();

export type WebauthnCredentialListResponse = z.infer<
  typeof webauthnCredentialListResponseSchema
>;
