"use client";

import { isPrivateBetaEnabled } from "@/lib/private-beta";
import {
  SCHEMAVAULTS_AUTH_APP_DEFINITION,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import { defaultAuthMiddlewareRules } from "@schemavaults/auth-common";
import AuthProvider from "@schemavaults/auth-react-provider";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useMemo, type ReactElement } from "react";

export interface ClientAuthProviderProps {
  children: ReactNode | ReactElement;
  environment: SchemaVaultsAppEnvironment;
}

export function ClientAuthProvider({
  children,
  environment,
}: ClientAuthProviderProps): ReactElement {
  const router = useRouter();
  const path = usePathname();
  const debug: boolean = useMemo(() => {
    if (isPrivateBetaEnabled()) {
      return true;
    } else if (environment === "development") {
      return true;
    } else if (environment === "test") {
      return true;
    }
    return false;
  }, [environment]);

  return (
    <AuthProvider
      path={path}
      router={router}
      authed_on_unauthed_redirect_uri="/account"
      unauthed_on_authed_redirect_uri="/auth/login"
      authMiddlewareRules={defaultAuthMiddlewareRules}
      app_id={SCHEMAVAULTS_AUTH_APP_DEFINITION.app_id}
      environment={environment}
      debug={debug}
    >
      {children}
    </AuthProvider>
  );
}

export default ClientAuthProvider;
