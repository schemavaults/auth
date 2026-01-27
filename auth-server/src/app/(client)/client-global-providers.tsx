"use client";

import type { PropsWithChildren, ReactElement } from "react";
import ClientAuthProvider from "./auth-provider";
import {
  LazyFramerMotionProvider,
  Toaster,
  TooltipProvider,
} from "@schemavaults/ui";
import type { SchemaVaultsAppEnvironment } from "@schemavaults/app-definitions";

export interface ClientOnlyGlobalProvidersProps extends PropsWithChildren {
  environment: SchemaVaultsAppEnvironment;
  invite_code_required?: boolean;
  debug?: boolean;
}

export default function ClientOnlyGlobalProviders({
  children,
  environment,
  debug = false,
  ...props
}: ClientOnlyGlobalProvidersProps): ReactElement {
  return (
    <ClientAuthProvider
      environment={environment}
      debug={debug}
      invite_code_required={typeof props.invite_code_required === 'boolean' ? props.invite_code_required : true}
    >
      <LazyFramerMotionProvider>
        <TooltipProvider>{children}</TooltipProvider>
        <Toaster />
      </LazyFramerMotionProvider>
    </ClientAuthProvider>
  );
}
