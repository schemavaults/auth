"use client";

import { useEffect } from "react";
import { useAuth } from "./use-auth";
import type { ISchemaVaultsAuthClient } from "@schemavaults/auth-client-sdk";
import { useRouter } from "next/navigation";
import {
  type SchemaVaultsAppEnvironment,
  useAppEnvironment,
} from "./use-app-environment";
import { useDebugWithSpecifiedBooleanOrLookupDefault } from "./use-debug";

export interface UseLogoutEffectOptions {
  onLogoutSuccess?: () => void;
  onLogoutFailure?: (e: unknown) => void;
  debug?: boolean;
}

export function useLogoutEffect({ onLogoutSuccess, onLogoutFailure, ...opts }: UseLogoutEffectOptions): void {
  const authContext = useAuth();
  const router = useRouter();
  const environment: SchemaVaultsAppEnvironment = useAppEnvironment();

  const debug: boolean = useDebugWithSpecifiedBooleanOrLookupDefault(
    environment,
    opts?.debug,
  );

  useEffect((): undefined | (() => void) => {
    let cancelDueToUnmount: boolean = false;

    function unsubscribe(): void {
      cancelDueToUnmount = true;
    }

    if (
      !authContext.ready ||
      !authContext.client ||
      !authContext.client.current
    ) {
      if (debug) {
        console.log(
          "[useLogoutEffect] Auth client not ready-- not attempting logout until effect is re-triggered!",
        );
      }
      return;
    }

    const auth: ISchemaVaultsAuthClient = authContext.client.current;

    const successful_logout_redirect_uri: string =
      auth.successful_logout_redirect_uri ?? "/";

    if (cancelDueToUnmount) {
      return;
    }

    if (debug) {
      console.log("[useLogoutEffect] Attempting to log out!");
    }

    auth
      .logout()
      .then(function onLogoutSuccessHandler(): void {
        if (typeof onLogoutSuccess === "function") {
          onLogoutSuccess();
        }
        router.push(successful_logout_redirect_uri);
        return;
      })
      .catch(function onLogoutFailureErorrHandler(e: unknown): void {
        if (typeof onLogoutFailure === "function") {
          onLogoutFailure(e);
        } else {
          const errMsg: string =
            e instanceof Error
              ? e.message
              : "An unknown error occurred while logging out!";
          console.error("[onLogoutFailure]", errMsg);
        }
        return;
      });

    return unsubscribe;
  }, [authContext, debug, onLogoutSuccess, onLogoutFailure, router]);
}
