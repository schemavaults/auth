"use client";

import type { UserData } from "@schemavaults/auth-common";
import type { ISchemaVaultsAuthClient } from "@schemavaults/auth-client-sdk";
import { useEffect, useState } from "react";
import useAuth from "@/hooks/use-auth";
import { USER_DATA_LOCAL_STORAGE_KEY } from "@/lib/react-auth-client-adapter";

export function useCurrentUser(): UserData | null {
  const auth = useAuth();
  const ready = auth.ready;
  const clientRef = auth.ready ? auth.client : null;

  const [user, setUser] = useState<UserData | null>(() => {
    if (!ready || !clientRef || !clientRef.current) {
      return null;
    }
    return clientRef.current.currentUser;
  });

  useEffect((): void | (() => void) => {
    if (!ready || !clientRef) {
      return;
    }
    const authClient: ISchemaVaultsAuthClient | null = clientRef.current;
    if (!authClient) {
      return;
    }

    // Sync once on mount / when ready flips — closes the race where the auth
    // client finishes initializing before a listener can attach.
    setUser(authClient.currentUser);

    const listener_id: string = authClient.onAuthStateChanged((): void => {
      setUser(authClient.currentUser);
    });

    // Auth state change events only fire in the tab that caused them; watch
    // cross-tab localStorage `storage` events for the cached user data so a
    // change made in another tab (e.g. completing email verification there)
    // updates this tab too. `key === null` means localStorage.clear().
    const onStorage = (event: StorageEvent): void => {
      if (event.key === null || event.key === USER_DATA_LOCAL_STORAGE_KEY) {
        setUser(authClient.currentUser);
      }
    };
    window.addEventListener("storage", onStorage);

    return (): void => {
      window.removeEventListener("storage", onStorage);
      try {
        authClient.removeAuthStateChangeListener(listener_id);
      } catch (e: unknown) {
        console.error(
          "[useCurrentUser] Failed to remove auth state change listener: ",
          e,
        );
      }
    };
  }, [ready, clientRef]);

  return user;
}

export default useCurrentUser;
