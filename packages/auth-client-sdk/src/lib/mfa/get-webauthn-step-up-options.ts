import {
  webauthnAuthenticationOptionsResponseSchema,
  type WebauthnAuthenticationOptionsResponse,
} from "@schemavaults/auth-common";
import type { ISchemaVaultsAuthClientAdapter } from "@/types/ISchemaVaultsAuthClientAdapter";

// Requests a WebAuthn assertion challenge to authorize a sensitive account
// action (removing a passkey) inside an authenticated session. The caller
// runs the browser assertion ceremony with the returned options and submits
// the result as the `webauthn` proof to removeWebauthnFactor.
export async function getWebauthnStepUpOptions(
  adapter: ISchemaVaultsAuthClientAdapter,
): Promise<WebauthnAuthenticationOptionsResponse> {
  const response = await adapter.fetch(
    `/api/user/mfa/webauthn/authenticate-options`,
    {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    },
  );
  if (!response.ok) {
    throw new Error(
      `Failed to start passkey verification (status ${response.status})`,
    );
  }
  const json: unknown = await response.json();
  const parsed = webauthnAuthenticationOptionsResponseSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error(
      `Unexpected getWebauthnStepUpOptions response: ${parsed.error.message}`,
    );
  }
  return parsed.data;
}
