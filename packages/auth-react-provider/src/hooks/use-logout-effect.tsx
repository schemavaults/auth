"use client";

import { useEffect, useMemo } from "react";
import { useAuth } from "./use-auth";
import type { ISchemaVaultsAuthClient } from "@schemavaults/auth-client-sdk";
import { useRouter } from "next/navigation";
import {
  type SchemaVaultsAppEnvironment,
  useAppEnvironment,
} from "./use-app-environment";
import { useDebugWithSpecifiedBooleanOrLookupDefault } from "./use-debug";

export interface UseLogoutEffectOptions {
  onLogoutSuccess?: (successful_logout_redirect_uri: string) => void;
  onLogoutFailure?: (e: unknown) => void;
  debug?: boolean;
}

export function useLogoutEffect({
  onLogoutSuccess,
  onLogoutFailure,
  ...opts
}: UseLogoutEffectOptions): void {
  const authContext = useAuth();
  const router = useRouter();
  const environment: SchemaVaultsAppEnvironment = useAppEnvironment();

  const debug: boolean = useDebugWithSpecifiedBooleanOrLookupDefault(
    environment,
    opts?.debug,
  );

  const onLogoutSuccessCallback: (
    successful_logout_redirect_uri: string,
  ) => void = useMemo(() => {
    if (typeof onLogoutSuccess === "function") {
      return onLogoutSuccess;
    } else {
      return function defaultOnLogoutSuccessCallback(
        successful_logout_redirect_uri: string,
      ): void {
        if (debug) {
          console.warn(
            "No 'onLogoutSuccess' callback is set! Falling back to default behaviour...",
          );
        }
        router.push(successful_logout_redirect_uri);
        return;
      }; // defaultOnLogoutSuccessCallback()
    }
  }, [debug, onLogoutSuccess, router]);

  const onLogoutFailureCallback: (e: unknown) => void = useMemo(() => {
    if (typeof onLogoutFailure === "function") {
      return onLogoutFailure;
    } else {
      return function defaultOnLogoutFailureCallback(e: unknown): void {
        if (debug) {
          console.warn(
            "No 'onLogoutFailure' callback is set! Falling back to default behaviour...",
          );
        }
        const errMsg: string =
          e instanceof Error
            ? e.message
            : "An unknown error occurred while logging out!";
        console.error("[defaultOnLogoutFailureCallback]", errMsg);
        return;
      }; // defaultOnLogoutFailureCallback()
    }
  }, [debug, onLogoutFailure]);

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
      .then(() => {
        if (cancelDueToUnmount) return;
        onLogoutSuccessCallback(successful_logout_redirect_uri);
        return;
      })
      .catch((e: unknown) => {
        if (cancelDueToUnmount) return;
        onLogoutFailureCallback(e);
        return;
      });

    return unsubscribe;
  }, [
    authContext,
    debug,
    onLogoutSuccessCallback,
    onLogoutFailureCallback,
    router,
  ]);
}

export default useLogoutEffect;