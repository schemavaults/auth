import "server-only";
import type { ReactElement } from "react";

import AccountPageView from "./auth-dashboard-account-page-view";
import type { PotentiallyValidTokenSource, UserData } from "@schemavaults/auth-common";
import { cookies } from "next/headers";
import { getAppEnvironment, SCHEMAVAULTS_AUTH_APP_DEFINITION, type SchemaVaultsAppEnvironment } from "@schemavaults/app-definitions";
import redirectWithError from "@/lib/redirect-with-error";
import { redirect } from "next/navigation";
import {
  AuthorizedAppsRegistry,
  ServerlessDatabase,
  preloadAppsTable,
  SchemaVaultsAppRegistry,
} from "@/lib/auth-db";
import type { PreloadedAppsTableDataWithDomainRefs } from "@schemavaults/auth-ui";
import { RouteGuardFactory } from "@schemavaults/auth-server-sdk";

async function attemptToPreloadAppsAndDomains(
  userData: UserData,
): Promise<PreloadedAppsTableDataWithDomainRefs> {
  await using dbh: ServerlessDatabase = ServerlessDatabase.createDBH();

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

export default async function AuthServerAccountDashboardPage(): Promise<ReactElement> {
  const environment: SchemaVaultsAppEnvironment = getAppEnvironment();
  if (environment === "development") {
    console.log("[AuthServerAccountDashboardPage] Preparing account page!");
  }

  const token_sources: PotentiallyValidTokenSource[] = [];

  const refresh_token_cookie = (await cookies()).get("refresh_token");
  if (typeof refresh_token_cookie?.value === "string") {
    token_sources.push({
      sourceHint: "Auth Server Refresh Token",
      type: "refresh",
      token: refresh_token_cookie.value,
    });
  }

  const route_guard_factory = RouteGuardFactory.getInstance();
  const route_guard = await route_guard_factory.createGuardFromTokenSources(
    "authenticated",
    token_sources,
    SCHEMAVAULTS_AUTH_APP_DEFINITION.app_id,
  );
  if (!route_guard.isAccessAllowed) {
    redirectWithError(
      (url: string, type): never => {
        return redirect(url);
      },
      401,
      "unauthenticated",
    );
  }
  const user = route_guard.user;
  if (!user) {
    redirectWithError(
      (url: string, type): never => {
        return redirect(url);
      },
      401,
      "load_user_data_failure",
    );
  }
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
    preloaded_authorized_apps = await attemptToPreloadAppsAndDomains(user);
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
