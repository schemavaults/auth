"use client";

import { createContext, useContext } from "react";
import type { PropsWithChildren, ReactElement } from "react";

// Defaults to null so a consumer rendered outside the provider fails loudly
// rather than silently pointing brand links at a hardcoded SchemaVaults URL.
// The root layout always mounts <AuthServerUrlProvider /> with the
// server-resolved getAuthServerUrl() value.
const AuthServerUrlContext = createContext<string | null>(null);

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
  const auth_server_url: string | null = useContext(AuthServerUrlContext);
  if (typeof auth_server_url !== "string") {
    throw new Error(
      "useAuthServerUrl() must be used within an <AuthServerUrlProvider />",
    );
  }
  return auth_server_url;
}

export default AuthServerUrlProvider;
