"use client";

import type { WebauthnCredentialSummary } from "@schemavaults/auth-common";
import type { ISchemaVaultsAuthClient } from "@schemavaults/auth-client-sdk";
import useSWR, { type KeyedMutator } from "swr";
import useAuth from "@/hooks/use-auth";
import useCurrentUser from "@/hooks/use-current-user";
import { MFA_STATUS_SWR_KEY_PREFIX } from "./use-mfa-factor-status-swr";

const DEDUPING_INTERVAL_MS = 15_000;

// Share the MFA status key prefix so the existing refreshAllMfaStatus()
// invalidation in useMfa() also revalidates the passkey list after an
// enroll/remove mutation.
export const WEBAUTHN_CREDENTIALS_SWR_KEY = `${MFA_STATUS_SWR_KEY_PREFIX}/webauthn/credentials`;

export interface UseWebauthnCredentialsSwrResult {
  data: WebauthnCredentialSummary[] | null;
  isLoading: boolean;
  refresh: KeyedMutator<WebauthnCredentialSummary[] | null>;
}

/**
 * Loads the current user's enrolled passkeys from /api/user/mfa/webauthn.
 * Returns null when the user is unauthenticated.
 */
export function useWebauthnCredentialsSwr(): UseWebauthnCredentialsSwrResult {
  const auth = useAuth();
  const inMemoryUser = useCurrentUser();
  const clientRef = auth.ready ? auth.client : null;
  const enabled = !!(auth.ready && clientRef?.current && inMemoryUser);

  const { data, isLoading, mutate } = useSWR<
    WebauthnCredentialSummary[] | null
  >(
    enabled ? WEBAUTHN_CREDENTIALS_SWR_KEY : null,
    async (): Promise<WebauthnCredentialSummary[] | null> => {
      const authClient: ISchemaVaultsAuthClient | null =
        clientRef?.current ?? null;
      if (!authClient) return null;
      return await authClient.listWebauthnCredentials();
    },
    {
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
