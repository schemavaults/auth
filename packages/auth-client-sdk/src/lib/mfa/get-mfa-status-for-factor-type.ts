import {
  mfaStatusResponseSchema,
  type MfaFactorType,
  type MfaStatusResponse,
} from "@schemavaults/auth-common";
import type { ISchemaVaultsAuthClientAdapter } from "@/types/ISchemaVaultsAuthClientAdapter";

export async function getMfaStatusForFactorType(
  adapter: ISchemaVaultsAuthClientAdapter,
  factor_type: MfaFactorType,
): Promise<MfaStatusResponse> {
  const response = await adapter.fetch(
    `/api/user/mfa/status/${encodeURIComponent(factor_type)}`,
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
  const parsed = mfaStatusResponseSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error(
      `Unexpected getMfaStatusForFactorType response: ${parsed.error.message}`,
    );
  }
  return parsed.data;
}
