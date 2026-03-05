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
  preloadAppsTable,
  SchemaVaultsAppRegistry,
  OrganizationsRegistry,
} from "@/lib/auth-db";
import type { PreloadedAppsTableDataWithDomainRefs } from "@schemavaults/auth-ui";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import SchemaVaultsPostgresNeonProxyAdapter from "@schemavaults/dbh";
import { withServerTrace } from "@/lib/withServerTrace";

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
  const organizationIds = await organizationsRegistry.listUserOrganizationMembershipIds(userData.uid, admin);

  const orgResults = await Promise.allSettled(
    organizationIds.map((orgId) => organizationsRegistry.lookupOrganization(orgId))
  );

  const organizations: OrganizationDefinition[] = [];
  for (const [i, result] of orgResults.entries()) {
    if (result.status === 'fulfilled') {
      organizations.push(result.value);
    } else {
      console.error(`Failed to lookup organization ${organizationIds[i]}:`, result.reason);
    }
  }

  return organizations;
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

  const [appsResult, orgsResult] = await withServerTrace({
    op_name: "GET /account (preload data)",
    op_category: "subroutine",
    event_id: crypto.randomUUID(),
    callback: async () => await Promise.allSettled([
      attemptToPreloadAppsAndDomains(dbh, user),
      attemptToPreloadUserOrganizations(dbh, user),
    ]),
  });

  const preloaded_authorized_apps = appsResult.status === 'fulfilled' ? appsResult.value : undefined;
  const preloaded_organizations = orgsResult.status === 'fulfilled' ? orgsResult.value : undefined;

  if (appsResult.status === 'rejected') {
    console.error("Failed to preload authorized apps:", appsResult.reason);
  }
  if (orgsResult.status === 'rejected') {
    console.error("Failed to preload user organizations:", orgsResult.reason);
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
