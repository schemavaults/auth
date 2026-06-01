import {
  webauthnCredentialListResponseSchema,
  type WebauthnCredentialSummary,
} from "@schemavaults/auth-common";
import type { ISchemaVaultsAuthClientAdapter } from "@/types/ISchemaVaultsAuthClientAdapter";

// Lists the current user's enrolled passkeys for the account settings UI.
export async function listWebauthnCredentials(
  adapter: ISchemaVaultsAuthClientAdapter,
): Promise<WebauthnCredentialSummary[]> {
  const response = await adapter.fetch(`/api/user/mfa/webauthn`, {
    method: "GET",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Failed to list passkeys (status ${response.status})`);
  }
  const json: unknown = await response.json();
  const parsed = webauthnCredentialListResponseSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error(
      `Unexpected listWebauthnCredentials response: ${parsed.error.message}`,
    );
  }
  return parsed.data.credentials;
}
