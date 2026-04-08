"use client";

import { useEffect, useEffectEvent } from "react";
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

  const runEffect: (auth: ISchemaVaultsAuthClient) => UnsubscribeFn =
    useEffectEvent(effect);

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
      const unsubscribe: UnsubscribeFn = runEffect(auth);
      if (typeof unsubscribe !== "function") {
        throw new TypeError("Expected 'unsubscribe' to be a function!");
      }
      return unsubscribe;
    }
  }, [authContext, debug]);
}

export default useEffectIfAuthenticated;
