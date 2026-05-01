import {
  mfaVerifyEnrollmentResponseSchema,
  type MfaVerifyEnrollmentResponse,
} from "@schemavaults/auth-common";
import type { ISchemaVaultsAuthClientAdapter } from "@/types/ISchemaVaultsAuthClientAdapter";

export async function regenerateRecoveryCodes(args: {
  adapter: ISchemaVaultsAuthClientAdapter;
  code: string;
}): Promise<MfaVerifyEnrollmentResponse> {
  const response = await args.adapter.fetch(
    `/api/user/mfa/recovery-codes/regenerate`,
    {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: args.code }),
    },
  );
  if (!response.ok) {
    throw new Error(
      `Failed to regenerate recovery codes (status ${response.status})`,
    );
  }
  const json: unknown = await response.json();
  const parsed = mfaVerifyEnrollmentResponseSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error(
      `Unexpected regenerateRecoveryCodes response: ${parsed.error.message}`,
    );
  }
  return parsed.data;
}
