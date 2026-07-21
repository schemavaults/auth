"use client";

import type { PropsWithChildren, ReactElement } from "react";
import ClientAuthProvider from "./auth-provider";
import {
  LazyFramerMotionProvider,
  Toaster,
  TooltipProvider,
} from "@schemavaults/ui";
import type {
  AppId,
  SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import { HydrationMarker } from "@/components/HydrationMarker";

export interface ClientOnlyGlobalProvidersProps extends PropsWithChildren {
  environment: SchemaVaultsAppEnvironment;
  /** The auth server's own app id, resolved server-side from SCHEMAVAULTS_AUTH_SERVER_APP_ID */
  auth_server_app_id: AppId;
  /** The auth server's own public URL, resolved server-side from SCHEMAVAULTS_AUTH_SERVER_URL */
  auth_server_url: string;
  invite_code_required?: boolean;
  debug?: boolean;
}

export default function ClientOnlyGlobalProviders({
  children,
  environment,
  auth_server_app_id,
  auth_server_url,
  debug = false,
  ...props
}: ClientOnlyGlobalProvidersProps): ReactElement {
  return (
    <ClientAuthProvider
      environment={environment}
      auth_server_app_id={auth_server_app_id}
      auth_server_url={auth_server_url}
      debug={debug}
      invite_code_required={typeof props.invite_code_required === 'boolean' ? props.invite_code_required : true}
    >
      <HydrationMarker />
      <LazyFramerMotionProvider>
        <TooltipProvider>{children}</TooltipProvider>
        <Toaster />
      </LazyFramerMotionProvider>
    </ClientAuthProvider>
  );
}
