"use client";

import { createContext, useContext } from "react";
import type { PropsWithChildren, ReactElement } from "react";
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
  return (
    <AuthServerFriendlyNameContext.Provider value={friendly_name}>
      {children}
    </AuthServerFriendlyNameContext.Provider>
  );
}

export function useAuthServerFriendlyName(): string {
  return useContext(AuthServerFriendlyNameContext);
}

export default AuthServerFriendlyNameProvider;
