"use client";

import {
  SCHEMAVAULTS_AUTH_APP_DEFINITION,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import { defaultAuthMiddlewareRules } from "@schemavaults/auth-common";
import AuthProvider from "@schemavaults/auth-react-provider";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, type ReactElement } from "react";

export interface ClientAuthProviderProps {
  children: ReactNode | ReactElement;
  environment: SchemaVaultsAppEnvironment;
  debug?: boolean;
  invite_code_required?: boolean;
}

export function ClientAuthProvider({
  children,
  environment,
  ...props
}: ClientAuthProviderProps): ReactElement {
  const router = useRouter();
  const path = usePathname();

  return (
    <AuthProvider
      path={path}
      router={router}
      authed_on_unauthed_redirect_uri="/account"
      unauthed_on_authed_redirect_uri="/auth/login"
      authorize_uri={undefined} // not used for @schemavaults/auth-server
      successful_logout_redirect_uri="/"
      successful_authentication_redirect_uri="/account"
      authMiddlewareRules={defaultAuthMiddlewareRules}
      app_id={SCHEMAVAULTS_AUTH_APP_DEFINITION.app_id}
      environment={environment}
      debug={typeof props.debug === 'boolean' ? props.debug : false}
      invite_code_required={typeof props.invite_code_required === 'boolean' ? props.invite_code_required : true}
    >
      {children}
    </AuthProvider>
  );
}

export default ClientAuthProvider;
