"use client";

import type { MfaStatusResponse } from "@schemavaults/auth-common";
import type { ISchemaVaultsAuthClient } from "@schemavaults/auth-client-sdk";
import useSWR, { type KeyedMutator } from "swr";
import useAuth from "@/hooks/use-auth";
import useCurrentUser from "@/hooks/use-current-user";

const REFRESH_INTERVAL_MS = 60_000;
const DEDUPING_INTERVAL_MS = 15_000;

export interface UseMfaStatusSwrResult {
  data: MfaStatusResponse | null;
  isLoading: boolean;
  refresh: KeyedMutator<MfaStatusResponse | null>;
}

/**
 * Loads the current user's MFA enrollment status from
 * /api/user/mfa/status. Returns null when the user is unauthenticated.
 */
export function useMfaStatusSwr(): UseMfaStatusSwrResult {
  const auth = useAuth();
  const inMemoryUser = useCurrentUser();
  const clientRef = auth.ready ? auth.client : null;
  const enabled = !!(auth.ready && clientRef?.current && inMemoryUser);

  const { data, isLoading, mutate } = useSWR<MfaStatusResponse | null>(
    enabled ? "/api/user/mfa/status" : null,
    async (): Promise<MfaStatusResponse | null> => {
      const authClient: ISchemaVaultsAuthClient | null =
        clientRef?.current ?? null;
      if (!authClient) return null;
      return await authClient.getMfaStatus();
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
