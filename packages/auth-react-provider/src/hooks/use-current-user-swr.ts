"use client";

import type { UserData } from "@schemavaults/auth-common";
import type { ISchemaVaultsAuthClient } from "@schemavaults/auth-client-sdk";
import useSWR from "swr";
import useAuth from "@/hooks/use-auth";
import useAppId from "@/hooks/use-app-id";
import useCurrentUser from "@/hooks/use-current-user";

const WHOAMI_REFRESH_INTERVAL_MS = 60_000;
const WHOAMI_DEDUPING_INTERVAL_MS = 15_000;

/**
 * @name useCurrentUserWithRevalidation
 * @description Like {@link useCurrentUser}, but additionally revalidates the
 * current user against the auth server's `/api/auth/whoami` endpoint on an
 * interval and on window focus. The in-memory auth client state remains the
 * primary source of truth so login/logout transitions propagate instantly; the
 * SWR layer serves as a self-healing fallback that picks up server-side role
 * changes without a page refresh.
 */
export function useCurrentUserWithRevalidation(): UserData | null {
  const inMemoryUser = useCurrentUser();
  const auth = useAuth();
  const app_id = useAppId();

  const clientRef = auth.ready ? auth.client : null;
  const enabled = !!(auth.ready && clientRef?.current && inMemoryUser);

  const { data: revalidatedUser } = useSWR<UserData | null>(
    enabled ? (["schemavaults:whoami", app_id] as const) : null,
    async (): Promise<UserData | null> => {
      const authClient: ISchemaVaultsAuthClient | null = clientRef?.current ?? null;
      if (!authClient) {
        return null;
      }
      return await authClient.checkIfAuthenticatedWithServer();
    },
    {
      refreshInterval: WHOAMI_REFRESH_INTERVAL_MS,
      dedupingInterval: WHOAMI_DEDUPING_INTERVAL_MS,
      revalidateOnFocus: true,
      fallbackData: inMemoryUser,
    },
  );

  return inMemoryUser ?? revalidatedUser ?? null;
}

export default useCurrentUserWithRevalidation;
