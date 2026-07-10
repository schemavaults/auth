"use client";

import { DEFAULT_AUTH_SERVER_OWNER_ORGANIZATION_ID } from "@schemavaults/app-definitions";
import { createContext, useContext } from "react";
import type { PropsWithChildren, ReactElement } from "react";

const AuthUiOwnerOrganizationContext = createContext<string>(
  DEFAULT_AUTH_SERVER_OWNER_ORGANIZATION_ID,
);

export interface AuthUiOwnerOrganizationProviderProps
  extends PropsWithChildren {
  /**
   * @description Organization ID that owns the auth server deployment (e.g.
   * the auth-server's resolved SCHEMAVAULTS_AUTH_SERVER_OWNER_ORGANIZATION
   * value), used as the default owner in admin create flows and to identify
   * the system organization. Falls back to
   * DEFAULT_AUTH_SERVER_OWNER_ORGANIZATION_ID ("schemavaults") when no
   * provider is mounted (e.g. resource servers without white-label
   * configuration).
   */
  owner_organization_id: string;
}

export function AuthUiOwnerOrganizationProvider({
  owner_organization_id,
  children,
}: AuthUiOwnerOrganizationProviderProps): ReactElement {
  return (
    <AuthUiOwnerOrganizationContext.Provider value={owner_organization_id}>
      {children}
    </AuthUiOwnerOrganizationContext.Provider>
  );
}

export function useAuthUiOwnerOrganizationId(): string {
  return useContext(AuthUiOwnerOrganizationContext);
}

export default AuthUiOwnerOrganizationProvider;
