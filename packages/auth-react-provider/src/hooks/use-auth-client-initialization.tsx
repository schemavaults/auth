"use client";

import {
  type ISchemaVaultsAuthClient,
  type InitializeAuthClientOptions,
} from "@schemavaults/auth-client-sdk";
import { type RefObject, useEffect } from "react";
import type { SchemaVaultsAppEnvironment } from "@schemavaults/app-definitions";
import AuthClientFactory from "@/lib/auth-client-factory";
import { useDebugWithSpecifiedBooleanOrLookupDefault } from "./use-debug";

export interface UseAuthClientInitializationOptions {
  ready: boolean;
  setReady: (ready: boolean) => void;
  authClientRef: RefObject<ISchemaVaultsAuthClient | null>;
  successful_authentication_redirect_uri: string;
  successful_logout_redirect_uri: string;
  authorize_uri?: string | undefined;
  auth_server_uri: string;
  app_id: string;
  debug?: boolean;
  default_audiences?: InitializeAuthClientOptions["default_audiences"];
  environment: SchemaVaultsAppEnvironment;
  invite_code_required?: boolean;
  fetch: (url: string, init: RequestInit | undefined) => Promise<Response>;
}

export function useAuthClientInitialization(
  opts: UseAuthClientInitializationOptions,
): void {
  const { ready, setReady } = opts;
  const {
    successful_authentication_redirect_uri,
    successful_logout_redirect_uri,
    authorize_uri,
  } = opts;
  const {
    authClientRef,
    auth_server_uri,
    app_id,
    default_audiences,
    environment,
  } = opts;

  const debug: boolean = useDebugWithSpecifiedBooleanOrLookupDefault(
    environment,
    opts.debug,
  );

  const invite_code_required: boolean =
    typeof opts.invite_code_required === "boolean"
      ? opts.invite_code_required
      : true;

  // Auth client initialization side-effect
  useEffect(
    function initializeAuthClientEffect(): void {
      if (debug) {
        console.log(
          "[useAuthClientInitialization] Running [useEffect->initializeAuthClientEffect] at URL: ",
          window.location.href,
        );
      }

      if (!ready) {
        if (debug) {
          console.log(
            "[useAuthClientInitialization] Auth client is not initialized, attempting to initialize at URL: ",
            window.location.href,
          );
        }

        try {
          const factory = new AuthClientFactory({
            debug,
            default_audiences,
            auth_server_uri,
            successful_authentication_redirect_uri,
            successful_logout_redirect_uri,
            authorize_uri,
            environment,
            app_id,
            invite_code_required,
            fetch: opts.fetch,
          });

          factory
            .createAuthClientInstance()
            .then((authClient): void => {
              if (!authClientRef.current) {
                authClientRef.current = authClient;
              }
              setReady(true);
            })
            .catch((e): void => {
              console.error(
                "[useAuthClientInitialization] Failed to init auth client: ",
                e,
              );
              throw new Error("Failed to initialize SchemaVaults auth client!");
            });
          return;
        } catch (e: unknown) {
          if (debug) {
            console.error(
              "[useAuthClientInitialization] Failed to initialize auth client: ",
              e,
            );
          }
          throw new Error("Failed to initialize auth client.");
        }
      } else {
        if (debug) {
          console.log(
            "[useAuthClientInitialization] Auth client already initialized.",
            ready,
          );
        }
        return;
      }
    },
    [
      ready,
      setReady,
      debug,
      app_id,
      auth_server_uri,
      authorize_uri,
      successful_authentication_redirect_uri,
      successful_logout_redirect_uri,
      environment,
      authClientRef,
      default_audiences,
      invite_code_required,
    ],
  ); // end of auth client initialization side-effect
}

export default useAuthClientInitialization;
