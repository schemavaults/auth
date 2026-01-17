import "server-only";
import type { ReactElement } from "react";

import AccountPageView from "./auth-dashboard-account-page-view";
import type {
  UserData,
} from "@schemavaults/auth-common";
import {
  type IProtectedAdminServerComponentPageProps,
  withAdminServerComponentRouteGuard,
} from "@/lib/withAdminRouteGuard";
import {
  AuthorizedAppsRegistry,
  ServerlessDatabase,
  preloadAppsTable,
  SchemaVaultsAppRegistry,
} from "@/lib/auth-db";
import type { PreloadedAppsTableDataWithDomainRefs } from "@schemavaults/auth-ui";

async function attemptToPreloadAppsAndDomains(
  dbh: ServerlessDatabase,
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
  { user, dbh }: IProtectedAdminServerComponentPageProps
): Promise<ReactElement> {

  if (!user) {
    // allow typescript to see that user data is set
    throw new Error(
      "This should be unreachable code-- redirectWithError seems to not have worked!",
    );
  }

  let preloaded_authorized_apps:
    | PreloadedAppsTableDataWithDomainRefs
    | undefined = undefined;
  try {
    preloaded_authorized_apps = await attemptToPreloadAppsAndDomains(dbh, user);
  } catch (e: unknown) {
    console.error("Failed to preload authorized apps:", e);
    /** no-op error */
  }

  return (
    <AccountPageView
      preloaded_authorized_apps_data={preloaded_authorized_apps}
    />
  );
}

export default async function AuthServerAccountDashboardPage(): Promise<ReactElement> {
  return await withAdminServerComponentRouteGuard(AuthServerAccountDashboardPageServerComponent);
}
