import "server-only";
import type { ReactElement } from "react";

import AccountPageView from "./auth-dashboard-account-page-view";
import type {
  OrganizationDefinition,
  UserData,
} from "@schemavaults/auth-common";
import {
  type IProtectedAuthenticatedServerComponentPageProps,
  withAuthenticatedServerComponentRouteGuard,
} from "@/lib/withAuthenticatedRouteGuard";
import {
  AuthorizedAppsRegistry,
  type ServerlessDatabase,
  preloadAppsTable,
  SchemaVaultsAppRegistry,
  OrganizationsRegistry,
} from "@/lib/auth-db";
import type { PreloadedAppsTableDataWithDomainRefs } from "@schemavaults/auth-ui";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import SchemaVaultsPostgresNeonProxyAdapter from "@schemavaults/dbh";

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

async function attemptToPreloadUserOrganizations(
  dbh: SchemaVaultsPostgresNeonProxyAdapter<AuthDatabase>,
  userData: UserData,
): Promise<readonly OrganizationDefinition[]> {
  const organizationsRegistry = new OrganizationsRegistry(dbh.db);
  const admin: boolean = userData.admin ?? false;
  const organizationIds = await organizationsRegistry.listUserOrganizationMemberships(userData.uid, admin);

  const organizations: OrganizationDefinition[] = [];
  for (const orgId of organizationIds) {
    try {
      const org = await organizationsRegistry.lookupOrganization(orgId);
      organizations.push(org);
    } catch (e: unknown) {
      console.error(`Failed to lookup organization ${orgId}:`, e);
    }
  }

  return organizations;
}

async function AuthServerAccountDashboardPageServerComponent(
  { user, dbh }: IProtectedAuthenticatedServerComponentPageProps<AuthDatabase>
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

  let preloaded_organizations: readonly OrganizationDefinition[] | undefined = undefined;
  try {
    preloaded_organizations = await attemptToPreloadUserOrganizations(dbh, user);
  } catch (e: unknown) {
    console.error("Failed to preload user organizations:", e);
    /** no-op error */
  }

  return (
    <AccountPageView
      preloaded_authorized_apps_data={preloaded_authorized_apps}
      preloaded_organizations={preloaded_organizations}
    />
  );
}

export default async function AuthServerAccountDashboardPage(): Promise<ReactElement> {
  return await withAuthenticatedServerComponentRouteGuard(AuthServerAccountDashboardPageServerComponent);
}
