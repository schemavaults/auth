"use client";

import type {
  AppId,
  SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import { defaultAuthMiddlewareRules } from "@schemavaults/auth-common";
import AuthProvider from "@schemavaults/auth-react-provider";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, type ReactNode, type ReactElement } from "react";
import { useSWRConfig } from "swr";

export interface ClientAuthProviderProps {
  children: ReactNode | ReactElement;
  environment: SchemaVaultsAppEnvironment;
  /**
   * The auth server's own app id, resolved server-side from the
   * SCHEMAVAULTS_AUTH_SERVER_APP_ID environment variable. The auth server's
   * frontend runs as its own client app, so this is used as both the client
   * app_id and the auth_server_app_id of the AuthProvider.
   */
  auth_server_app_id: AppId;
  /**
   * The auth server's own public URL, resolved server-side from the
   * SCHEMAVAULTS_AUTH_SERVER_URL environment variable. Client bundles can't
   * read that env var, so without this prop the AuthProvider would silently
   * fall back to the per-environment default (e.g. auth.schemavaults.com in
   * production), sending white-label deployments' API calls cross-origin.
   */
  auth_server_url: string;
  debug?: boolean;
  invite_code_required?: boolean;
}

export function ClientAuthProvider({
  children,
  environment,
  auth_server_app_id,
  auth_server_url,
  ...props
}: ClientAuthProviderProps): ReactElement {
  const router = useRouter();
  const path = usePathname();
  const { mutate } = useSWRConfig();

  const handleLogout = useCallback(async (): Promise<void> => {
    await mutate(() => true, undefined, { revalidate: false });

    if (typeof window !== "undefined") {
      try {
        window.sessionStorage.clear();
      } catch {
        // Storage access can throw in locked-down browser contexts; ignore.
      }
    }
  }, [mutate]);

  return (
    <AuthProvider
      path={path}
      router={router}
      authed_on_unauthed_redirect_uri="/account"
      unauthed_on_authed_redirect_uri="/auth/login"
      authorize_uri={undefined} // not used for @schemavaults/auth-server
      error_page_uri="/error"
      successful_logout_redirect_uri="/"
      successful_authentication_redirect_uri="/account"
      authMiddlewareRules={defaultAuthMiddlewareRules}
      app_id={auth_server_app_id}
      auth_server_app_id={auth_server_app_id}
      auth_server_url={auth_server_url}
      environment={environment}
      debug={typeof props.debug === 'boolean' ? props.debug : false}
      invite_code_required={typeof props.invite_code_required === 'boolean' ? props.invite_code_required : true}
      fetch={async (url: string, init: RequestInit | undefined) => await fetch(url, init)}
      onLogout={handleLogout}
    >
      {children}
    </AuthProvider>
  );
}

export default ClientAuthProvider;
