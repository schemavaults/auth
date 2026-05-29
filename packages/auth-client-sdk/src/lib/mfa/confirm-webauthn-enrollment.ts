import {
  mfaVerifyEnrollmentResponseSchema,
  type MfaVerifyEnrollmentResponse,
  type WebauthnRegistrationResponse,
} from "@schemavaults/auth-common";
import type { ISchemaVaultsAuthClientAdapter } from "@/types/ISchemaVaultsAuthClientAdapter";

// Confirms a pending passkey enrollment by submitting the browser's
// registration attestation. On success the factor is verified; recovery
// codes are returned only if this is the user's first verified factor (see
// `recovery_codes_issued`).
export async function confirmWebauthnEnrollment(args: {
  adapter: ISchemaVaultsAuthClientAdapter;
  factor_id: string;
  attestation: WebauthnRegistrationResponse;
  label?: string;
}): Promise<MfaVerifyEnrollmentResponse> {
  const response = await args.adapter.fetch(
    `/api/user/mfa/webauthn/verify-enrollment`,
    {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        factor_id: args.factor_id,
        attestation: args.attestation,
        ...(args.label ? { label: args.label } : {}),
      }),
    },
  );
  if (!response.ok) {
    throw new Error(
      `Failed to confirm passkey enrollment (status ${response.status})`,
    );
  }
  const json: unknown = await response.json();
  const parsed = mfaVerifyEnrollmentResponseSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error(
      `Unexpected confirmWebauthnEnrollment response: ${parsed.error.message}`,
    );
  }
  return parsed.data;
}
