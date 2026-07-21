"use client";

import {
  AuthProvider,
  type SchemaVaultsAppEnvironment,
  type AppId,
  type SchemaVaultsAuthProviderProps,
} from "@schemavaults/auth-react-provider";
import { usePathname, useRouter } from "next/navigation";
import type { PropsWithChildren } from "react";

export interface IAppAuthProviderProps extends PropsWithChildren {
  environment: SchemaVaultsAppEnvironment;
  app_id: AppId;
  /**
   * The auth server's public URL, resolved server-side (e.g. from the
   * SCHEMAVAULTS_AUTH_SERVER_URL environment variable) and threaded in as a
   * prop. Client bundles can't read that env var, so omitting this falls
   * back to the per-environment default auth server URL — only correct when
   * the app targets the default SchemaVaults deployment, not a white-label
   * auth server.
   */
  auth_server_url?: string;
  default_audiences: readonly string[];
  debug?: boolean;
  authed_on_unauthed_redirect_uri: string;
  unauthed_on_authed_redirect_uri: string;
  successful_logout_redirect_uri: string;
  successful_authentication_redirect_uri: string;
  authorize_uri: string;
  autoreacquire_access_tokens?: boolean;
  authMiddlewareRules?: SchemaVaultsAuthProviderProps["authMiddlewareRules"];
  onLogout?: SchemaVaultsAuthProviderProps["onLogout"];
}

export default function AppAuthProvider({
  environment,
  app_id,
  ...props
}: IAppAuthProviderProps) {
  const router = useRouter();
  const path: string = usePathname();
  const debug: boolean =
    typeof props.debug === "boolean"
      ? props.debug
      : environment !== "production";

  return (
    <AuthProvider
      app_id={app_id}
      auth_server_url={props.auth_server_url}
      login_uri="/auth/login"
      register_uri="/auth/register"
      authed_on_unauthed_redirect_uri={props.authed_on_unauthed_redirect_uri}
      unauthed_on_authed_redirect_uri={props.unauthed_on_authed_redirect_uri}
      successful_logout_redirect_uri={props.successful_logout_redirect_uri}
      successful_authentication_redirect_uri={
        props.successful_authentication_redirect_uri
      }
      authorize_uri={props.authorize_uri}
      router={router}
      path={path}
      default_audiences={props.default_audiences}
      autoreacquire_access_tokens={
        typeof props.autoreacquire_access_tokens === "boolean"
          ? props.autoreacquire_access_tokens
          : Array.isArray(props.default_audiences) &&
            props.default_audiences.length > 0
      }
      debug={debug}
      environment={environment}
      fetch={async (url: string, init: RequestInit | undefined) =>
        await fetch(url, init)
      }
      authMiddlewareRules={props.authMiddlewareRules}
      onLogout={props.onLogout}
    >
      {props.children}
    </AuthProvider>
  );
}
