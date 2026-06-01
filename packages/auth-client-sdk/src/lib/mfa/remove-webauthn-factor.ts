import type { MfaProof } from "@schemavaults/auth-common";
import type { ISchemaVaultsAuthClientAdapter } from "@/types/ISchemaVaultsAuthClientAdapter";

// Removes a passkey by id. Requires step-up proof of a current factor: a TOTP
// code, a fresh passkey assertion (from getWebauthnStepUpOptions), or a
// recovery code.
export async function removeWebauthnFactor(args: {
  adapter: ISchemaVaultsAuthClientAdapter;
  factor_id: string;
  proof: MfaProof;
}): Promise<void> {
  const response = await args.adapter.fetch(
    `/api/user/mfa/webauthn/${encodeURIComponent(args.factor_id)}`,
    {
      method: "DELETE",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ proof: args.proof }),
    },
  );
  if (!response.ok) {
    throw new Error(`Failed to remove passkey (status ${response.status})`);
  }
}
