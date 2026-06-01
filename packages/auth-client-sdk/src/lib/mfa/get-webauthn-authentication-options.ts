import {
  webauthnAuthenticationOptionsResponseSchema,
  type WebauthnAuthenticationOptionsResponse,
} from "@schemavaults/auth-common";
import type { AppId } from "@schemavaults/app-definitions";
import type { ISchemaVaultsAuthClientAdapter } from "@/types/ISchemaVaultsAuthClientAdapter";

// Login-time (unauthenticated) request for a WebAuthn assertion challenge
// bound to an in-flight MFA challenge. The caller runs the browser assertion
// ceremony with the returned options and submits the result via
// verifyMfaChallenge with a `webauthn` proof.
export async function getWebauthnAuthenticationOptions(args: {
  adapter: ISchemaVaultsAuthClientAdapter;
  challenge_id: string;
  client_app_id: AppId;
}): Promise<WebauthnAuthenticationOptionsResponse> {
  const response = await args.adapter.fetch(`/api/auth/mfa/webauthn/options`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      challenge_id: args.challenge_id,
      client_app_id: args.client_app_id,
    }),
  });
  if (!response.ok) {
    throw new Error(
      `Failed to start passkey challenge (status ${response.status})`,
    );
  }
  const json: unknown = await response.json();
  const parsed = webauthnAuthenticationOptionsResponseSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error(
      `Unexpected getWebauthnAuthenticationOptions response: ${parsed.error.message}`,
    );
  }
  return parsed.data;
}
