"use client";

import { useEffect } from "react";
import useAuth from "./use-auth";
import type { ISchemaVaultsAuthClient } from "@schemavaults/auth-client-sdk";
import useDebug from "./use-debug";
import useAppEnvironment, {
  type SchemaVaultsAppEnvironment,
} from "./use-app-environment";

type UnsubscribeFn = () => void;

export function useEffectIfAuthenticated(
  effect: (auth: ISchemaVaultsAuthClient) => UnsubscribeFn,
) {
  const authContext = useAuth();
  const environment: SchemaVaultsAppEnvironment = useAppEnvironment();
  const debug: boolean = useDebug(environment);

  useEffect(() => {
    if (!authContext.ready || !authContext.client.current) {
      return;
    }
    const auth: ISchemaVaultsAuthClient = authContext.client.current;
    const isAuthenticated: boolean = auth.isAuthenticated;
    if (debug) {
      console.log(
        `[useEffectIfAuthenticated] isAuthenticated = ${isAuthenticated ? "True" : "False"}`,
      );
    }
    if (isAuthenticated) {
      if (debug) {
        console.log(`[useEffectIfAuthenticated] Running 'effect' fn...`);
      }
      if (typeof effect !== "function") {
        throw new TypeError("Expected 'effect' to be a function!");
      }
      const unsubscribe: UnsubscribeFn = effect(auth);
      if (typeof unsubscribe !== "function") {
        throw new TypeError("Expected 'unsubscribe' to be a function!");
      }
      return unsubscribe;
    }
  }, [authContext, effect, debug]);
}

export default useEffectIfAuthenticated;
