"use client";

import { createContext, useContext } from "react";
import type { PropsWithChildren, ReactElement } from "react";

// The context default is only a fallback for consumers rendered outside the
// provider; the root layout always mounts <AuthServerUrlProvider /> with the
// server-resolved getAuthServerUrl() value. Matches getDefaultAuthServerUrl()'s
// production default in @schemavaults/app-definitions.
const DEFAULT_AUTH_SERVER_URL = "https://auth.schemavaults.com";

const AuthServerUrlContext = createContext<string>(DEFAULT_AUTH_SERVER_URL);

export interface AuthServerUrlProviderProps extends PropsWithChildren {
  /**
   * @description Server-resolved getAuthServerUrl() value (from the
   * SCHEMAVAULTS_AUTH_SERVER_URL environment variable, falling back to the
   * per-environment default). Delivered to client components so white-label
   * deployments can point brand links at their own auth server URL.
   */
  auth_server_url: string;
}

export function AuthServerUrlProvider({
  auth_server_url,
  children,
}: AuthServerUrlProviderProps): ReactElement {
  return (
    <AuthServerUrlContext.Provider value={auth_server_url}>
      {children}
    </AuthServerUrlContext.Provider>
  );
}

export function useAuthServerUrl(): string {
  return useContext(AuthServerUrlContext);
}

export default AuthServerUrlProvider;
