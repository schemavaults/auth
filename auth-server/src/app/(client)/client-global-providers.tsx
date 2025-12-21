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
}

export default function ClientOnlyGlobalProviders({
  children,
  environment,
}: ClientOnlyGlobalProvidersProps): ReactElement {
  return (
    <ClientAuthProvider environment={environment}>
      <LazyFramerMotionProvider>
        <TooltipProvider>{children}</TooltipProvider>
        <Toaster />
      </LazyFramerMotionProvider>
    </ClientAuthProvider>
  );
}
