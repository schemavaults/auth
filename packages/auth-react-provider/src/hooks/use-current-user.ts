"use client";

import type { UserData } from "@schemavaults/auth-common";
import useAuth from "@/hooks/use-auth";
import type { ISchemaVaultsAuthClient } from "@schemavaults/auth-client-sdk";
import useAppEnvironment from "@/hooks/use-app-environment";
import { useDebug } from "@/hooks/use-debug";
import { useState } from "react";
import { useAuthClientStateWatcher } from "./use-auth-client-state-watcher";

function getCurrentUser(auth: ISchemaVaultsAuthClient): UserData | null {
  return auth.currentUser;
}

function maybeGetCurrentUserFromAuthHook(
  authClientRef: ReturnType<typeof useAuth>,
  debug: boolean = false,
): UserData | null {
  if (
    authClientRef.ready &&
    authClientRef.client &&
    authClientRef.client.current
  ) {
    const auth: ISchemaVaultsAuthClient = authClientRef.client.current;
    const currentUser: UserData | null = getCurrentUser(auth);

    if (!!currentUser) {
      if (debug) {
        console.log(
          "[maybeGetCurrentUserFromAuthHook] Loaded current user data from auth client: ",
          currentUser,
        );
      }
      return currentUser satisfies UserData;
    }

    if (debug) {
      console.log(
        "[maybeGetCurrentUserFromAuthHook] Auth client appears to be ready-- but no current user was found!",
      );
    }

    return currentUser;
  }

  return null;
}

export function useCurrentUser(): UserData | null {
  const environment = useAppEnvironment();
  const authClientRef = useAuth();
  const debug: boolean = useDebug(environment);

  const [user, setUser] = useState<UserData | null>(
    maybeGetCurrentUserFromAuthHook(authClientRef, debug),
  );

  useAuthClientStateWatcher({
    debug,
    onAuthStateChanged: async ({ auth }): Promise<void> => {
      setUser(auth.currentUser);
    },
  });

  if (debug) {
    console.warn(
      "[useCurrentUser] Auth client is not ready yet, returning null for user data!",
    );
  }

  return user satisfies UserData | null;
}

export default useCurrentUser;
