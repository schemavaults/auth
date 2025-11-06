"use client";

import { isPrivateBetaEnabled } from "@/lib/private-beta";
import {
  SCHEMAVAULTS_AUTH_APP_DEFINITION,
  SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import { defaultAuthMiddlewareRules } from "@schemavaults/auth-common";
import {
  AuthProvider,
  useAppEnvironment,
} from "@schemavaults/auth-react-provider";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, type PropsWithChildren, type ReactElement } from "react";

export interface ClientAuthProviderProps extends PropsWithChildren {}

export function ClientAuthProvider({
  children,
}: ClientAuthProviderProps): ReactElement {
  const router = useRouter();
  const path = usePathname();
  const environment: SchemaVaultsAppEnvironment = useAppEnvironment();
  const debug: boolean = useMemo(() => {
    if (isPrivateBetaEnabled()) {
      return true;
    } else if (
      environment === "development" ||
      environment === "test" ||
      environment === "staging"
    ) {
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
      debug={debug}
    >
      {children}
    </AuthProvider>
  );
}
