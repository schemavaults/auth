// (client)/layout.tsx
import "server-only";

import {
  type AppId,
  getAppEnvironment,
  getAuthServerUrl,
  schemaVaultsAppEnvironmentSchema,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import type { PropsWithChildren, ReactElement } from "react";
import ClientOnlyGlobalProviders from "./client-global-providers";
import shouldEnableDebug from "@/lib/should-enable-debug";
import getAuthServerAppId from "@/lib/config/auth-server-app-id";
import inviteCodesRequired from "@/lib/config/invite-codes-required";
import { ServerlessDatabase } from "@/lib/auth-db/serverless-database";
import { connection } from "next/server";

async function requireInviteCode(): Promise<boolean> {
  "use cache";
  await using dbh = ServerlessDatabase.createDBH();
  return await inviteCodesRequired(dbh.db);
}

export default async function ClientFacingServerPageLayout({
  children,
}: PropsWithChildren): Promise<ReactElement> {
  await connection();
  const environment: SchemaVaultsAppEnvironment = getAppEnvironment();
  if (!schemaVaultsAppEnvironmentSchema.safeParse(environment)) {
    throw new Error(
      "Failed to load app environment to render client page layout with!",
    );
  }
  const debug: boolean = shouldEnableDebug(environment);
  // Resolved server-side; client components can't read the env vars directly
  const auth_server_app_id: AppId = getAuthServerAppId();
  const auth_server_url: string = getAuthServerUrl(environment);
  return (
    <ClientOnlyGlobalProviders
      environment={environment}
      debug={debug}
      invite_code_required={await requireInviteCode()}
      auth_server_app_id={auth_server_app_id}
      auth_server_url={auth_server_url}
    >
      {children}
    </ClientOnlyGlobalProviders>
  );
}
