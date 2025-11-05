"use client";

import type { ISchemaVaultsAuthClient } from "@schemavaults/auth-client-sdk";
import { RefObject, useEffect } from "react";
import { useAuth } from "./use-auth";
import {
  useAppEnvironment,
  type SchemaVaultsAppEnvironment,
} from "./use-app-environment";
import { useDebugWithSpecifiedBooleanOrLookupDefault } from "./use-debug";

export interface OnAuthStateChangedHandlerInput {
  auth: ISchemaVaultsAuthClient;
  debug: boolean;
}

export type UseAuthClientStateWatcherOptions = {
  onAuthStateChanged: (opts: OnAuthStateChangedHandlerInput) => Promise<void>;
  debug?: boolean;
};

type UnsubscribeFn = () => void;

export function useAuthClientStateWatcher({
  onAuthStateChanged,
  ...opts
}: UseAuthClientStateWatcherOptions): void {
  const auth = useAuth();
  const environment: SchemaVaultsAppEnvironment = useAppEnvironment();
  const debug: boolean = useDebugWithSpecifiedBooleanOrLookupDefault(
    environment,
    opts.debug,
  );

  // Attach an auth-state change listener to the auth client
  useEffect((): void | UnsubscribeFn => {
    if (!auth.ready) {
      if (debug) {
        console.log(
          "[useAuthClientStateWatcher] Auth client not ready, skipping...",
        );
      }
      return;
    }

    async function handleAuthSDKStateChangeEvent(): Promise<void> {
      if (debug) {
        console.log("[useAuthClientStateWatcher] Auth SDK state changed.");
      }

      try {
        if (!auth.ready) {
          throw new Error(
            "Cannot handle auth SDK state change event when auth client is not initialized",
          );
        }

        const authClient = auth.client.current;
        if (!authClient) {
          if (debug) {
            console.warn("[useAuthClientStateWatcher] Auth client is null.");
          }
          return;
        }

        const onAuthStateChangedHandlerInput: OnAuthStateChangedHandlerInput = {
          auth: authClient,
          debug,
        };

        try {
          await onAuthStateChanged(onAuthStateChangedHandlerInput);
        } catch (e: unknown) {
          console.error(
            "There was an error running the onAuthStateChanged callback passed to useAuthClientStateWatcher: ",
            e,
          );
          throw new Error(
            "There was an error running the onAuthStateChanged callback passed to useAuthClientStateWatcher!",
          );
        }
      } catch (e: unknown) {
        console.error(
          "[useAuthClientStateWatcher] Error handling auth SDK state change event: ",
          e,
        );
      }
    } // end of handleAuthSDKStateChangeEvent

    const authClientRef: RefObject<ISchemaVaultsAuthClient | null> =
      auth.client;

    if (authClientRef.current) {
      if (debug) {
        console.log(
          "[useAuthClientStateWatcher] Adding auth state change listener...",
        );
      }
      let listener_id: string;
      try {
        const new_listener_id: string =
          authClientRef.current.onAuthStateChanged(
            handleAuthSDKStateChangeEvent,
          );
        if (typeof new_listener_id !== "string") {
          throw new Error(
            `Expected to receive a unique listener ID string after setting up onAuthStateChanged listener, but received type: ${typeof new_listener_id}`,
          );
        }
        listener_id = new_listener_id;
      } catch (e: unknown) {
        console.error(
          "[useAuthClientStateWatcher] Failed to add auth state change listener.",
          e,
        );
        return;
      }

      const unsubscribe: UnsubscribeFn = (): void => {
        if (authClientRef.current) {
          console.assert(
            typeof listener_id === "string",
            `Expected listener ID to unsubscribe auth-state-change-listener from to be a string!`,
          );
          try {
            authClientRef.current.removeAuthStateChangeListener(listener_id);
          } catch (e: unknown) {
            console.error(
              "[useAuthClientStateWatcher] Failed to remove auth state change listener.",
            );
          }
          return;
        }
      };
      return unsubscribe;
    }
  }, [auth, debug]);
}
