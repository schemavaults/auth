import {
  mfaVerifyEnrollmentResponseSchema,
  type MfaVerifyEnrollmentResponse,
} from "@schemavaults/auth-common";
import type { ISchemaVaultsAuthClientAdapter } from "@/types/ISchemaVaultsAuthClientAdapter";

export async function confirmTotpEnrollment(args: {
  adapter: ISchemaVaultsAuthClientAdapter;
  factor_id: string;
  code: string;
}): Promise<MfaVerifyEnrollmentResponse> {
  const response = await args.adapter.fetch(
    `/api/user/mfa/totp/verify-enrollment`,
    {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ factor_id: args.factor_id, code: args.code }),
    },
  );
  if (!response.ok) {
    throw new Error(
      `Failed to confirm TOTP enrollment (status ${response.status})`,
    );
  }
  const json: unknown = await response.json();
  const parsed = mfaVerifyEnrollmentResponseSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error(
      `Unexpected confirmTotpEnrollment response: ${parsed.error.message}`,
    );
  }
  return parsed.data;
}
