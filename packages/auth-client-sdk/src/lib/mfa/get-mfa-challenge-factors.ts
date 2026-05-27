import {
  mfaChallengeFactorsResponseSchema,
  type MfaChallengeFactorsResponse,
} from "@schemavaults/auth-common";
import type { ISchemaVaultsAuthClientAdapter } from "@/types/ISchemaVaultsAuthClientAdapter";

export interface GetMfaChallengeFactorsOpts {
  adapter: ISchemaVaultsAuthClientAdapter;
  challenge_id: string;
  client_app_id: string;
}

export class MfaChallengeExpiredError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "MfaChallengeExpiredError";
  }
}

export async function getMfaChallengeFactors(
  opts: GetMfaChallengeFactorsOpts,
): Promise<MfaChallengeFactorsResponse> {
  const params = new URLSearchParams({
    challenge_id: opts.challenge_id,
    client_app_id: opts.client_app_id,
  });
  const response = await opts.adapter.fetch(
    `/api/auth/mfa/challenge/factors?${params.toString()}`,
    {
      method: "GET",
      credentials: "same-origin",
    },
  );
  if (response.status === 410) {
    throw new MfaChallengeExpiredError(
      "MFA challenge not found or expired. Please log in again.",
    );
  }
  if (!response.ok) {
    throw new Error(
      `Failed to load MFA challenge factors (status ${response.status})`,
    );
  }
  const json: unknown = await response.json();
  const parsed = mfaChallengeFactorsResponseSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error(
      `Unexpected /api/auth/mfa/challenge/factors response: ${parsed.error.message}`,
    );
  }
  return parsed.data;
}
