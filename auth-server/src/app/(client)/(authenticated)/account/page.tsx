import "server-only";
import type { ReactElement } from "react";

import AccountPageView from "./auth-dashboard-account-page-view";
import type { UserData } from "@schemavaults/auth-common";
import {
  type IProtectedAuthenticatedServerComponentPageProps,
  withAuthenticatedServerComponentRouteGuard,
} from "@/lib/withAuthenticatedRouteGuard";
import {
  AuthorizedAppsRegistry,
  preloadAppsTable,
  SchemaVaultsAppRegistry,
} from "@/lib/auth-db";
import type { PreloadedAppsTableDataWithDomainRefs } from "@schemavaults/auth-ui";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import SchemaVaultsPostgresNeonProxyAdapter from "@schemavaults/dbh";
import { withServerTrace } from "@/lib/withServerTrace";
import { connection } from "next/server";
import type { ServerRuntime } from "next";

async function attemptToPreloadAppsAndDomains(
  dbh: SchemaVaultsPostgresNeonProxyAdapter<AuthDatabase>,
  userData: UserData,
): Promise<PreloadedAppsTableDataWithDomainRefs> {
  let appsRegistry: SchemaVaultsAppRegistry | undefined;
  let authorizedAppsRegistry: AuthorizedAppsRegistry | undefined;
  try {
    appsRegistry = new SchemaVaultsAppRegistry(dbh.db);
    authorizedAppsRegistry = new AuthorizedAppsRegistry(dbh.db);
  } catch (e: unknown) {
    console.error(e);
    throw new Error("Failed to load app registries");
  }

  if (appsRegistry && authorizedAppsRegistry && userData) {
    const preloaded = await preloadAppsTable({
      appsRegistry,
      authorizedAppsRegistry,
      list_apps_query_type: "authorized",
      user: userData,
    });
    return preloaded;
  }

  throw new Error(
    "Failed to prepare dependencies to preload authorized apps for user",
  );
}

async function AuthServerAccountDashboardPageServerComponent(
  { user, dbh }: IProtectedAuthenticatedServerComponentPageProps
): Promise<ReactElement> {

  if (!user) {
    // allow typescript to see that user data is set
    throw new Error(
      "This should be unreachable code-- redirectWithError seems to not have worked!",
    );
  }

  const appsResult = await withServerTrace({
    op_name: "GET /account (preload data)",
    op_category: "subroutine",
    event_id: crypto.randomUUID(),
    callback: async () =>
      await attemptToPreloadAppsAndDomains(dbh, user).catch((reason) => {
        console.error("Failed to preload authorized apps:", reason);
        return undefined;
      }),
  });

  return (
    <AccountPageView
      preloaded_authorized_apps_data={appsResult}
    />
  );
}

export default async function AuthServerAccountDashboardPage(): Promise<ReactElement> {
  await connection();
  return await withAuthenticatedServerComponentRouteGuard(AuthServerAccountDashboardPageServerComponent);
}

export const runtime: ServerRuntime = "nodejs";
