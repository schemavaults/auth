"use client";

import type { UserData } from "@schemavaults/auth-common";
import type { ISchemaVaultsAuthClient } from "@schemavaults/auth-client-sdk";
import { useCallback } from "react";
import useAuth from "@/hooks/use-auth";

/**
 * @name useRefreshUserData
 * @description Returns a callback that forces a refresh-token exchange so the
 * client's tokens and cached `currentUser` reflect the current server-side
 * user record (see {@link ISchemaVaultsAuthClient.refreshUserData}). Call it
 * after an action known to change the user's claims — e.g. completing email
 * verification — so components reading `useCurrentUser` update immediately
 * without a re-login. Resolves with the refreshed user data, or null when no
 * user is logged in (or the auth client is not ready).
 */
export function useRefreshUserData(): () => Promise<UserData | null> {
  const auth = useAuth();
  const clientRef = auth.ready ? auth.client : null;

  return useCallback(async (): Promise<UserData | null> => {
    const authClient: ISchemaVaultsAuthClient | null =
      clientRef?.current ?? null;
    if (!authClient) {
      return null;
    }
    return await authClient.refreshUserData();
  }, [clientRef]);
}

export default useRefreshUserData;
