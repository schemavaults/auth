"use client";

import { createContext, useContext } from "react";
import type { PropsWithChildren, ReactElement } from "react";
import { AuthUiFriendlyNameProvider } from "@schemavaults/auth-ui";
import { DEFAULT_AUTH_SERVER_FRIENDLY_NAME } from "@/lib/config/default-auth-server-friendly-name";

const AuthServerFriendlyNameContext = createContext<string>(
  DEFAULT_AUTH_SERVER_FRIENDLY_NAME,
);

export interface AuthServerFriendlyNameProviderProps
  extends PropsWithChildren {
  /**
   * @description Server-resolved SCHEMAVAULTS_AUTH_SERVER_FRIENDLY_NAME value
   */
  friendly_name: string;
}

export function AuthServerFriendlyNameProvider({
  friendly_name,
  children,
}: AuthServerFriendlyNameProviderProps): ReactElement {
  // Also feed the @schemavaults/auth-ui copy context so the shared
  // cards/dialogs render this deployment's name instead of their built-in
  // "SchemaVaults" fallback.
  return (
    <AuthServerFriendlyNameContext.Provider value={friendly_name}>
      <AuthUiFriendlyNameProvider friendly_name={friendly_name}>
        {children}
      </AuthUiFriendlyNameProvider>
    </AuthServerFriendlyNameContext.Provider>
  );
}

export function useAuthServerFriendlyName(): string {
  return useContext(AuthServerFriendlyNameContext);
}

export default AuthServerFriendlyNameProvider;
