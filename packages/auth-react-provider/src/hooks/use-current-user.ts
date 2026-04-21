"use client";

import type { UserData } from "@schemavaults/auth-common";
import type { ISchemaVaultsAuthClient } from "@schemavaults/auth-client-sdk";
import { useEffect, useState } from "react";
import useAuth from "@/hooks/use-auth";

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

    return (): void => {
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
