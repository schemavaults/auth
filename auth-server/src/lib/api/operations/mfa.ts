import type { AnyOperationDefinition } from "@schemavaults/openapi-operations";
import { regenerateRecoveryCodes } from "@/app/api/user/mfa/recovery-codes/regenerate/operation";
import { getMfaStatus } from "@/app/api/user/mfa/status/operation";
import { getMfaFactorTypeStatus } from "@/app/api/user/mfa/status/[factor_type]/operation";
import { removeTotpFactor } from "@/app/api/user/mfa/totp/[factor_id]/operation";
import { enrollTotp } from "@/app/api/user/mfa/totp/enroll/operation";
import { verifyTotpEnrollment } from "@/app/api/user/mfa/totp/verify-enrollment/operation";
import { listPasskeys } from "@/app/api/user/mfa/webauthn/operation";
import { removePasskey } from "@/app/api/user/mfa/webauthn/[factor_id]/operation";
import { beginPasskeyStepUp } from "@/app/api/user/mfa/webauthn/authenticate-options/operation";
import { beginPasskeyEnrollment } from "@/app/api/user/mfa/webauthn/options/operation";
import { verifyPasskeyEnrollment } from "@/app/api/user/mfa/webauthn/verify-enrollment/operation";

/**
 * Operations of the "mfa" domain, in the order they appear in the docs:
 * the signed-in user's MFA management under `/api/user/mfa/*` (status,
 * authenticator-app enrollment and removal, recovery codes, passkeys).
 */
export const mfaOperations: readonly AnyOperationDefinition[] = [
  // Status
  getMfaStatus,
  getMfaFactorTypeStatus,
  // Authenticator app (TOTP)
  enrollTotp,
  verifyTotpEnrollment,
  removeTotpFactor,
  // Recovery codes
  regenerateRecoveryCodes,
  // Passkeys (WebAuthn)
  listPasskeys,
  beginPasskeyEnrollment,
  verifyPasskeyEnrollment,
  beginPasskeyStepUp,
  removePasskey,
];
