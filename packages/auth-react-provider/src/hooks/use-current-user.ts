"use client";

import type { UserData } from "@schemavaults/auth-common";
import type { ISchemaVaultsAuthClient } from "@schemavaults/auth-client-sdk";
import { useCallback, useSyncExternalStore } from "react";
import useAuth from "@/hooks/use-auth";

export function useCurrentUser(): UserData | null {
  const auth = useAuth();
  const ready = auth.ready;
  const clientRef = auth.ready ? auth.client : null;

  const subscribe = useCallback(
    (onStoreChange: () => void): (() => void) => {
      if (!ready || !clientRef) {
        return (): void => {};
      }
      const authClient: ISchemaVaultsAuthClient | null = clientRef.current;
      if (!authClient) {
        return (): void => {};
      }
      const listener_id: string = authClient.onAuthStateChanged(onStoreChange);
      return (): void => {
        if (clientRef.current) {
          try {
            clientRef.current.removeAuthStateChangeListener(listener_id);
          } catch (e: unknown) {
            console.error(
              "[useCurrentUser] Failed to remove auth state change listener: ",
              e,
            );
          }
        }
      };
    },
    [ready, clientRef],
  );

  const getSnapshot = useCallback((): UserData | null => {
    if (!ready || !clientRef || !clientRef.current) {
      return null;
    }
    return clientRef.current.currentUser;
  }, [ready, clientRef]);

  const getServerSnapshot = useCallback((): UserData | null => null, []);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export default useCurrentUser;
