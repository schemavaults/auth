import {
  mfaFactorStatusResponseSchema,
  mfaFactorTypeSchema,
  type MfaFactorType,
  type MfaFactorStatusResponse,
} from "@schemavaults/auth-common";
import type { ISchemaVaultsAuthClientAdapter } from "@/types/ISchemaVaultsAuthClientAdapter";

export async function getMfaStatusForFactorType(
  adapter: ISchemaVaultsAuthClientAdapter,
  factor_type: MfaFactorType,
): Promise<MfaFactorStatusResponse> {
  // Validate the factor type before building the request URL.
  const validatedFactorType = mfaFactorTypeSchema.parse(factor_type);
  const response = await adapter.fetch(
    `/api/user/mfa/status/${encodeURIComponent(validatedFactorType)}`,
    {
      method: "GET",
      credentials: "include",
    },
  );
  if (!response.ok) {
    throw new Error(
      `Failed to load MFA status for factor type "${factor_type}" (status ${response.status})`,
    );
  }
  const json: unknown = await response.json();
  const parsed = mfaFactorStatusResponseSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error(
      `Unexpected getMfaStatusForFactorType response: ${parsed.error.message}`,
    );
  }
  return parsed.data;
}
