"use client";

import { createContext, useContext } from "react";
import type { PropsWithChildren, ReactElement } from "react";

/**
 * @description Fallback product/deployment name rendered in auth-ui copy when
 * no <AuthUiFriendlyNameProvider /> is mounted (e.g. resource servers that
 * embed these components without white-label configuration).
 */
export const DEFAULT_AUTH_UI_FRIENDLY_NAME = "SchemaVaults Auth";

const AuthUiFriendlyNameContext = createContext<string>(
  DEFAULT_AUTH_UI_FRIENDLY_NAME,
);

export interface AuthUiFriendlyNameProviderProps extends PropsWithChildren {
  /**
   * @description Human-friendly name of the auth server deployment (e.g. the
   * auth-server's resolved SCHEMAVAULTS_AUTH_SERVER_FRIENDLY_NAME value),
   * interpolated into card/dialog copy so white-label deployments don't
   * render hardcoded "SchemaVaults" text.
   */
  friendly_name: string;
}

export function AuthUiFriendlyNameProvider({
  friendly_name,
  children,
}: AuthUiFriendlyNameProviderProps): ReactElement {
  return (
    <AuthUiFriendlyNameContext.Provider value={friendly_name}>
      {children}
    </AuthUiFriendlyNameContext.Provider>
  );
}

export function useAuthUiFriendlyName(): string {
  return useContext(AuthUiFriendlyNameContext);
}

export default AuthUiFriendlyNameProvider;
