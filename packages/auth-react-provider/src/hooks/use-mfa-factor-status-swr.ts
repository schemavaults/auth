"use client";

import type {
  MfaFactorType,
  MfaFactorStatusResponse,
} from "@schemavaults/auth-common";
import type { ISchemaVaultsAuthClient } from "@schemavaults/auth-client-sdk";
import useSWR, { type KeyedMutator } from "swr";
import useAuth from "@/hooks/use-auth";
import useCurrentUser from "@/hooks/use-current-user";

const REFRESH_INTERVAL_MS = 60_000;
const DEDUPING_INTERVAL_MS = 15_000;

// Shared with useMfaStatusSwr so a single global mutate() over this prefix
// revalidates both the aggregate status and every per-factor-type status.
export const MFA_STATUS_SWR_KEY_PREFIX = "/api/user/mfa/status";

export interface UseMfaFactorStatusSwrResult {
  data: MfaFactorStatusResponse | null;
  isLoading: boolean;
  refresh: KeyedMutator<MfaFactorStatusResponse | null>;
}

/**
 * Loads the current user's MFA enrollment status for a single factor type
 * from /api/user/mfa/status/[factor_type]. Returns null when the user is
 * unauthenticated.
 */
export function useMfaFactorStatusSwr(
  factor_type: MfaFactorType,
): UseMfaFactorStatusSwrResult {
  const auth = useAuth();
  const inMemoryUser = useCurrentUser();
  const clientRef = auth.ready ? auth.client : null;
  const enabled = !!(auth.ready && clientRef?.current && inMemoryUser);

  const { data, isLoading, mutate } = useSWR<MfaFactorStatusResponse | null>(
    enabled ? `${MFA_STATUS_SWR_KEY_PREFIX}/${factor_type}` : null,
    async (): Promise<MfaFactorStatusResponse | null> => {
      const authClient: ISchemaVaultsAuthClient | null =
        clientRef?.current ?? null;
      if (!authClient) return null;
      return await authClient.getMfaStatusForFactorType(factor_type);
    },
    {
      refreshInterval: REFRESH_INTERVAL_MS,
      dedupingInterval: DEDUPING_INTERVAL_MS,
      revalidateOnFocus: true,
    },
  );

  return {
    data: data ?? null,
    isLoading,
    refresh: mutate,
  };
}
