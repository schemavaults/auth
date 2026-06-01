import {
  webauthnEnrollOptionsResponseSchema,
  type WebauthnEnrollOptionsResponse,
} from "@schemavaults/auth-common";
import type { ISchemaVaultsAuthClientAdapter } from "@/types/ISchemaVaultsAuthClientAdapter";

// Starts a passkey enrollment: the server creates a pending factor and
// returns the WebAuthn registration options (PublicKeyCredentialCreation
// OptionsJSON) plus the factor_id the enrollment is confirmed against. The
// caller runs the browser registration ceremony with these options.
export async function beginWebauthnEnrollment(
  adapter: ISchemaVaultsAuthClientAdapter,
): Promise<WebauthnEnrollOptionsResponse> {
  const response = await adapter.fetch(`/api/user/mfa/webauthn/options`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  if (!response.ok) {
    throw new Error(
      `Failed to begin passkey enrollment (status ${response.status})`,
    );
  }
  const json: unknown = await response.json();
  const parsed = webauthnEnrollOptionsResponseSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error(
      `Unexpected beginWebauthnEnrollment response: ${parsed.error.message}`,
    );
  }
  return parsed.data;
}
