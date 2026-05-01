import {
  mfaStatusResponseSchema,
  type MfaStatusResponse,
} from "@schemavaults/auth-common";
import type { ISchemaVaultsAuthClientAdapter } from "@/types/ISchemaVaultsAuthClientAdapter";

export async function getMfaStatus(
  adapter: ISchemaVaultsAuthClientAdapter,
): Promise<MfaStatusResponse> {
  const response = await adapter.fetch(`/api/user/mfa/status`, {
    method: "GET",
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error(`Failed to load MFA status (status ${response.status})`);
  }
  const json: unknown = await response.json();
  const parsed = mfaStatusResponseSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error(`Unexpected getMfaStatus response: ${parsed.error.message}`);
  }
  return parsed.data;
}
