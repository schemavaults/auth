"use client";

import { useEffect } from "react";
import useAuth from "./use-auth";
import type { ISchemaVaultsAuthClient } from "@schemavaults/auth-client-sdk";

type UnsubscribeFn = () => void;

export function useEffectIfAuthenticated(
  effect: (auth: ISchemaVaultsAuthClient) => UnsubscribeFn,
) {
  const authContext = useAuth();

  useEffect(() => {
    if (!authContext.ready || !authContext.client.current) {
      return;
    }
    const auth: ISchemaVaultsAuthClient = authContext.client.current;
    if (auth.isAuthenticated) {
      const unsubscribe: UnsubscribeFn = effect(auth);
      return unsubscribe;
    }
  }, [authContext, effect]);
}

export default useEffectIfAuthenticated;
