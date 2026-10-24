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
import { createLastKnownGoodLookup } from "@/lib/last-known-good";
import { connection } from "next/server";

// Every client page renders through this layout (the home page included), so
// a database outage must not fail or stall it. Until a lookup succeeds the
// auth provider gets no value and applies its own default (required); the
// register page re-reads the setting itself, and the server enforces it.
const requireInviteCode = createLastKnownGoodLookup<boolean | undefined>({
  name: "ClientFacingServerPageLayout.inviteCodesRequired",
  load: async () => {
    await using dbh = ServerlessDatabase.createDBH();
    return await inviteCodesRequired(dbh.db);
  },
  fallback: undefined,
  timeout_ms: 1_500,
  retry_after_ms: 15_000,
});

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
