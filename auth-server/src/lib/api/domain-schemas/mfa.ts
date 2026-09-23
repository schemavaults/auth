// Imported first on purpose: it installs zod-to-openapi's `.openapi()` on
// zod, and zod v4 copies prototype methods onto each schema when it is
// constructed, so the auth-common schemas below must be built after it.
import { z, withOpenApi } from "@schemavaults/openapi-operations";
import {
  mfaEnrollResponseSchema,
  mfaFactorStatusResponseSchema,
  mfaStatusResponseSchema,
  mfaVerifyEnrollmentResponseSchema,
  webauthnAuthenticationOptionsResponseSchema,
  webauthnCredentialListResponseSchema,
  webauthnEnrollOptionsResponseSchema,
} from "@schemavaults/auth-common";

/**
 * Response schemas of the signed-in user's MFA management operations
 * (`/api/user/mfa/*`). They are the wire schemas from
 * `@schemavaults/auth-common` (which the client SDK parses strictly),
 * registered under stable component names for the OpenAPI document. These
 * endpoints return their payload raw, without the `{ success, ... }`
 * envelope of the other management endpoints.
 */

/** Path parameter of the factor-scoped operations. */
export const mfaFactorIdParam = z.guid().openapi({
  description: "MFA factor id, as returned by the enrollment endpoints and `GET /api/user/mfa/status`",
  example: "0d3f0b8a-1f0e-4a8c-9a4e-2b3c4d5e6f70",
});

export const MfaStatus = withOpenApi(mfaStatusResponseSchema, "MfaStatus", {
  description:
    "Account-wide MFA status: every verified factor plus the number of unused recovery codes. `enabled` mirrors `factors.length > 0`.",
});

export const MfaFactorStatus = withOpenApi(mfaFactorStatusResponseSchema, "MfaFactorStatus", {
  description:
    "Status of one factor type. `enabled` means a verified factor of that type exists; `pending` means an enrollment was started but not confirmed yet. `factor_id` / `factor_type` are present whenever a factor row exists, `verified_at` (Unix epoch milliseconds) only when enabled.",
});

export const MfaTotpEnrollment = withOpenApi(mfaEnrollResponseSchema, "MfaTotpEnrollment", {
  description:
    "A pending TOTP enrollment: the base32 secret, the `otpauth://` URL and a PNG data URL of its QR code to show the user, plus the `factor_id` to confirm the enrollment with.",
});

export const MfaVerifyEnrollmentResult = withOpenApi(mfaVerifyEnrollmentResponseSchema, 
  "MfaVerifyEnrollmentResult",
  {
    description:
      "Outcome of confirming a factor (or regenerating recovery codes). `recovery_codes_issued` tells whether `recovery_codes` carries freshly minted codes to display; when false the user's existing codes still apply and the array is empty.",
  },
);

/** `{ success: true }`: a factor was removed. */
export const MfaFactorRemoved = z
  .object({ success: z.literal(true) })
  .openapi("MfaFactorRemoved");

export const MfaWebauthnCredentialList = withOpenApi(webauthnCredentialListResponseSchema, 
  "MfaWebauthnCredentialList",
  { description: "The caller's verified passkeys. Pending (unconfirmed) enrollments are not listed." },
);

export const MfaWebauthnEnrollOptions = withOpenApi(webauthnEnrollOptionsResponseSchema, 
  "MfaWebauthnEnrollOptions",
  {
    description:
      "A pending passkey enrollment: the `PublicKeyCredentialCreationOptionsJSON` to hand to `navigator.credentials.create()` verbatim, plus the `factor_id` to confirm the enrollment with.",
  },
);

export const MfaWebauthnStepUpOptions = withOpenApi(webauthnAuthenticationOptionsResponseSchema, 
  "MfaWebauthnStepUpOptions",
  {
    description:
      "The `PublicKeyCredentialRequestOptionsJSON` to hand to `navigator.credentials.get()` verbatim for a step-up passkey assertion.",
  },
);
