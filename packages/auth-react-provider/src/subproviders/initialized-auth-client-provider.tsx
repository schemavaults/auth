"use client";

import { SchemaVaultsAuthContext } from "@/contexts/auth-client-context";
import type { ISchemaVaultsAuthClient } from "@schemavaults/auth-client-sdk";
import { type PropsWithChildren, type ReactElement, type RefObject, use } from "react";

export interface InitializedAuthClientProviderProps extends PropsWithChildren {
  authClientRefPromise: Promise<RefObject<ISchemaVaultsAuthClient>>;
}

export function InitializedAuthClientProvider(
  { children, authClientRefPromise }: InitializedAuthClientProviderProps
): ReactElement {
  const authClient: RefObject<ISchemaVaultsAuthClient> = use(authClientRefPromise);
  return (
    <SchemaVaultsAuthContext.Provider value={{
      ready: true,
      client: authClient
    }}>
      {children}
    </SchemaVaultsAuthContext.Provider>
  );
}
