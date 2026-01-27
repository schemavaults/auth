// (client)/layout.tsx
import "server-only";

import {
  getAppEnvironment,
  schemaVaultsAppEnvironmentSchema,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import type { PropsWithChildren, ReactElement } from "react";
import ClientOnlyGlobalProviders from "./client-global-providers";
import shouldEnableDebug from "@/lib/should-enable-debug";
import inviteCodesRequired from "@/lib/config/invite-codes-required";
import { ServerlessDatabase } from "@/lib/auth-db/serverless-database";

async function requireInviteCode(): Promise<boolean> {
  "use cache";
  await using dbh = ServerlessDatabase.createDBH();
  return await inviteCodesRequired(dbh.db);
}

export default async function ClientFacingServerPageLayout({
  children,
}: PropsWithChildren): Promise<ReactElement> {
  const environment: SchemaVaultsAppEnvironment = getAppEnvironment();
  if (!schemaVaultsAppEnvironmentSchema.safeParse(environment)) {
    throw new Error(
      "Failed to load app environment to render client page layout with!",
    );
  }
  const debug: boolean = shouldEnableDebug(environment);
  return (
    <ClientOnlyGlobalProviders environment={environment} debug={debug} invite_code_required={await requireInviteCode()}>
      {children}
    </ClientOnlyGlobalProviders>
  );
}
