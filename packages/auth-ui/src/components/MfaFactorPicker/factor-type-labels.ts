import type { MfaFactorType } from "@schemavaults/auth-common";

export interface MfaFactorTypeLabel {
  label: string;
  description: string;
}

// Single source of truth for human-readable factor labels. Adding a new
// factor type to `MfaFactorType` requires (and only requires) adding a new
// entry here for the factor picker to render it.
export const MFA_FACTOR_TYPE_LABELS: Record<MfaFactorType, MfaFactorTypeLabel> =
  {
    totp: {
      label: "Authenticator app",
      description: "Enter the 6-digit code from your authenticator app.",
    },
    webauthn: {
      label: "Passkey / Security key",
      description:
        "Use your passkey, security key, or device biometrics.",
    },
  };

export function labelForFactorType(factor_type: MfaFactorType): MfaFactorTypeLabel {
  return MFA_FACTOR_TYPE_LABELS[factor_type];
}
