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
import { useOnLogout } from "./use-on-logout";
import type { OnLogoutCallback } from "@/contexts/on-logout-context";

type OnLogoutSuccessHandler = (successful_logout_redirect_uri: string) => void;
type OnLogoutFailureHandler = (e: unknown) => void;

export interface UseLogoutEffectOptions {
  onLogoutSuccess?: OnLogoutSuccessHandler;
  onLogoutFailure?: OnLogoutFailureHandler;
  debug?: boolean;
}

export function useLogoutEffect(opts?: UseLogoutEffectOptions): void {
  const authContext = useAuth();
  const router = useRouter();
  const customOnLogoutSuccess: OnLogoutSuccessHandler | undefined =
    opts?.onLogoutSuccess;
  const customOnLogoutFailure: OnLogoutFailureHandler | undefined =
    opts?.onLogoutFailure;
  const onLogout: OnLogoutCallback | null = useOnLogout();
  const environment: SchemaVaultsAppEnvironment = useAppEnvironment();

  const debug: boolean = useDebugWithSpecifiedBooleanOrLookupDefault(
    environment,
    opts?.debug,
  );

  const onLogoutSuccessCallback: (
    successful_logout_redirect_uri: string,
  ) => void = useMemo(() => {
    if (typeof customOnLogoutSuccess === "function") {
      return customOnLogoutSuccess;
    } else {
      return function defaultOnLogoutSuccessCallback(
        successful_logout_redirect_uri: string,
      ): void {
        if (debug) {
          console.warn(
            "No custom 'onLogoutSuccess' callback is set! Falling back to default behaviour...",
          );
        }
        if (typeof successful_logout_redirect_uri !== "string") {
          throw new TypeError(
            "Expected 'successful_logout_redirect_uri' to be a string in logout success callback!",
          );
        }
        router.push(successful_logout_redirect_uri);
        return;
      }; // defaultOnLogoutSuccessCallback()
    }
  }, [debug, customOnLogoutSuccess, router]);

  const onLogoutFailureCallback: (e: unknown) => void = useMemo(() => {
    if (typeof customOnLogoutFailure === "function") {
      return customOnLogoutFailure;
    } else {
      return function defaultOnLogoutFailureCallback(e: unknown): void {
        if (debug) {
          console.warn(
            "No custom 'onLogoutFailure' callback is set! Falling back to default behaviour...",
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
  }, [debug, customOnLogoutFailure]);

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
      .then(async () => {
        if (cancelDueToUnmount) return;
        if (typeof onLogout === "function") {
          try {
            await onLogout();
          } catch (e: unknown) {
            if (debug) {
              console.error("[useLogoutEffect] onLogout callback threw:", e);
            }
          }
        }
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
    onLogout,
    onLogoutSuccessCallback,
    onLogoutFailureCallback,
    router,
  ]);
}

export default useLogoutEffect;
