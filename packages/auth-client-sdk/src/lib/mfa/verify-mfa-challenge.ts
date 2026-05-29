import {
  authenticateResultSchema,
  type AuthenticateResult,
  type MfaProof,
} from "@schemavaults/auth-common";
import type { ISchemaVaultsAuthClientAdapter } from "@/types/ISchemaVaultsAuthClientAdapter";

export interface VerifyMfaChallengeOpts {
  adapter: ISchemaVaultsAuthClientAdapter;
  challenge_id: string;
  client_app_id: string;
  proof: MfaProof;
}

export async function verifyMfaChallenge(
  opts: VerifyMfaChallengeOpts,
): Promise<AuthenticateResult> {
  const response = await opts.adapter.fetch(`/api/auth/mfa/verify`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      challenge_id: opts.challenge_id,
      client_app_id: opts.client_app_id,
      proof: opts.proof,
    }),
  });

  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch {
    throw new Error(
      `Failed to parse JSON response from /api/auth/mfa/verify (status ${response.status})`,
    );
  }
  const result = authenticateResultSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(
      `Unexpected /api/auth/mfa/verify response shape: ${result.error.message}`,
    );
  }
  return result.data;
}
