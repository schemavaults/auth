// (client)/layout.tsx

import {
  getAppEnvironment,
  schemaVaultsAppEnvironmentSchema,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import type { PropsWithChildren, ReactElement } from "react";
import "server-only";
import ClientOnlyGlobalProviders from "./client-global-providers";

export default async function ClientFacingServerPageLayout({
  children,
}: PropsWithChildren): Promise<ReactElement> {
  const environment: SchemaVaultsAppEnvironment = getAppEnvironment();
  if (!schemaVaultsAppEnvironmentSchema.safeParse(environment)) {
    throw new Error(
      "Failed to load app environment to render client page layout with!",
    );
  }
  return (
    <ClientOnlyGlobalProviders environment={environment}>
      {children}
    </ClientOnlyGlobalProviders>
  );
}
