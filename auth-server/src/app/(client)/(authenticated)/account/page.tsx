import "server-only";
import type { ReactElement } from "react";

import AccountPageView from "./auth-dashboard-account-page-view";
import {
  getAuthServerUrl,
  organizationMembershipRoleDetailsSchema,
  type OrganizationMembershipRoleDetails,
  type UserData,
} from "@schemavaults/auth-common";
import {
  type IProtectedAuthenticatedServerComponentPageProps,
  withAuthenticatedServerComponentRouteGuard,
} from "@/lib/withAuthenticatedRouteGuard";
import {
  AuthorizedAppsRegistry,
  listUserOrganizationMemberships,
  OrganizationsRegistry,
  preloadAppsTable,
  SchemaVaultsAppRegistry,
  type ServerlessDatabase,
} from "@/lib/auth-db";
import type { PreloadedAppsTableDataWithDomainRefs } from "@schemavaults/auth-ui";
import adminOnlyOrganizationCreation from "@/lib/config/admin-only-organization-creation";
import { withServerTrace } from "@/lib/withServerTrace";
import { connection } from "next/server";
import type { ServerRuntime } from "next";

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

async function attemptToPreloadUserOrganizationMemberships(
  dbh: ServerlessDatabase,
  userData: UserData,
): Promise<readonly OrganizationMembershipRoleDetails[]> {
  const admin: boolean = userData.admin ?? false;
  const memberships = await listUserOrganizationMemberships(
    dbh.db,
    userData.uid,
    admin,
  );

  const organizationsRegistry = new OrganizationsRegistry(dbh.db);

  const enrichedResults = await Promise.allSettled(
    memberships.map(async (membership): Promise<OrganizationMembershipRoleDetails> => {
      const orgDef = await organizationsRegistry.lookupOrganization(
        membership.organization_id,
      );
      const parsed = await organizationMembershipRoleDetailsSchema.safeParseAsync({
        organization_id: membership.organization_id,
        organization_name: orgDef.name,
        role: membership.role,
        created_at: orgDef.created_at,
        joined_at: membership.created_at,
      });
      if (!parsed.success) {
        throw new Error(
          `Failed to validate preloaded OrganizationMembershipRoleDetails for organization "${membership.organization_id}": ${parsed.error.message}`,
        );
      }
      return parsed.data;
    }),
  );

  const preloaded: OrganizationMembershipRoleDetails[] = [];
  for (const [i, result] of enrichedResults.entries()) {
    if (result.status === "fulfilled") {
      preloaded.push(result.value);
    } else {
      console.error(
        `Failed to preload OrganizationMembershipRoleDetails for organization ${memberships[i]?.organization_id ?? "unknown"}:`,
        result.reason,
      );
    }
  }

  return preloaded;
}

async function AuthServerAccountDashboardPageServerComponent(
  { user, dbh, redis, environment }: IProtectedAuthenticatedServerComponentPageProps
): Promise<ReactElement> {
  const auth_server_url: string = getAuthServerUrl(environment);

  if (!user) {
    // allow typescript to see that user data is set
    throw new Error(
      "This should be unreachable code-- redirectWithError seems to not have worked!",
    );
  }

  const [appsResult, orgsResult, adminOnlyOrgCreationResult] =
    await withServerTrace({
      op_name: "GET /account (preload data)",
      op_category: "subroutine",
      event_id: crypto.randomUUID(),
      callback: async () =>
        await Promise.allSettled([
          attemptToPreloadAppsAndDomains(dbh, user),
          attemptToPreloadUserOrganizationMemberships(dbh, user),
          adminOnlyOrganizationCreation(dbh.db, redis.client),
        ]),
    });

  const preloaded_authorized_apps =
    appsResult.status === "fulfilled" ? appsResult.value : undefined;
  const preloaded_organization_memberships =
    orgsResult.status === "fulfilled" ? orgsResult.value : undefined;

  if (appsResult.status === "rejected") {
    console.error("Failed to preload authorized apps:", appsResult.reason);
  }
  if (orgsResult.status === "rejected") {
    console.error(
      "Failed to preload user organization memberships:",
      orgsResult.reason,
    );
  }
  if (adminOnlyOrgCreationResult.status === "rejected") {
    console.error(
      "Failed to load server setting for admin_only_organization_creation on account page:",
      adminOnlyOrgCreationResult.reason,
    );
  }
  // If the setting can't be loaded, fall back to showing the button;
  // POST /api/organizations enforces the restriction regardless.
  const adminOnlyOrgCreation: boolean =
    adminOnlyOrgCreationResult.status === "fulfilled"
      ? adminOnlyOrgCreationResult.value
      : false;
  const can_create_organization: boolean =
    user.admin === true || !adminOnlyOrgCreation;

  return (
    <AccountPageView
      auth_server_url={auth_server_url}
      preloaded_authorized_apps_data={preloaded_authorized_apps}
      preloaded_organization_memberships={preloaded_organization_memberships}
      can_create_organization={can_create_organization}
    />
  );
}

export default async function AuthServerAccountDashboardPage(): Promise<ReactElement> {
  await connection();
  return await withAuthenticatedServerComponentRouteGuard(
    AuthServerAccountDashboardPageServerComponent,
    { next_href: "/account" },
  );
}

export const runtime: ServerRuntime = "nodejs";
