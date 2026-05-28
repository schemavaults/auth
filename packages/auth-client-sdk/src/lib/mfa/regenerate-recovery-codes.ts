import { z } from "zod";
import {
  mfaVerifyEnrollmentResponseSchema,
  type MfaVerifyEnrollmentResponse,
} from "@schemavaults/auth-common";
import type { ISchemaVaultsAuthClientAdapter } from "@/types/ISchemaVaultsAuthClientAdapter";

const factorIdSchema = z.string().uuid();

export async function regenerateRecoveryCodes(args: {
  adapter: ISchemaVaultsAuthClientAdapter;
  factor_id: string;
  code: string;
}): Promise<MfaVerifyEnrollmentResponse> {
  // Validate the factor_id before building the request body.
  const factor_id = factorIdSchema.parse(args.factor_id);
  const response = await args.adapter.fetch(
    `/api/user/mfa/recovery-codes/regenerate`,
    {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ factor_id, code: args.code }),
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
