"use client";
import type {
  ApiServerId,
  AppId,
  SchemaVaultsAppEnvironment,
} from "@schemavaults/auth-server-sdk";
import { PropsWithChildren, ReactElement } from "react";
import AuthProvider from "./auth/auth-provider";
import { Toaster, ToastProvider } from "@schemavaults/ui";

export interface ClientLayoutProps extends PropsWithChildren {
  app_id: AppId;
  api_server_id: ApiServerId;
  environment: SchemaVaultsAppEnvironment;
}

export default function ClientLayout({
  children,
  environment,
  app_id,
  api_server_id,
}: ClientLayoutProps): ReactElement {
  return (
    <AuthProvider
      environment={environment}
      app_id={app_id}
      default_audiences={[api_server_id]}
      authed_on_unauthed_redirect_uri="/account"
      unauthed_on_authed_redirect_uri="/auth/login"
      successful_logout_redirect_uri="/"
      successful_authentication_redirect_uri="/account"
      authorize_uri="/auth/authorize"
    >
      <ToastProvider>
        {children}
        <Toaster />
      </ToastProvider>
    </AuthProvider>
  );
}
