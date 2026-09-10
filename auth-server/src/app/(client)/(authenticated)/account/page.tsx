import "server-only";
import type { ReactElement } from "react";

import AccountPageView from "./auth-dashboard-account-page-view";
import {
  getAuthServerUrl,
  type OrganizationMembershipRoleDetails,
  type UserData,
} from "@schemavaults/auth-common";
import {
  type IProtectedAuthenticatedServerComponentPageProps,
  withAuthenticatedServerComponentRouteGuard,
} from "@/lib/withAuthenticatedRouteGuard";
import {
  AuthorizedAppsRegistry,
  listUserOrganizationMembershipDetails,
  preloadAppsTable,
  SchemaVaultsAppRegistry,
  UserRegistry,
  type ServerlessDatabase,
} from "@/lib/auth-db";
import {
  userProfileNamesSchema,
  type UserProfileNames,
} from "@schemavaults/auth-common";
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
  return await listUserOrganizationMembershipDetails(dbh.db, {
    uid: userData.uid,
    admin: userData.admin ?? false,
  });
}

async function attemptToPreloadUserProfile(
  dbh: ServerlessDatabase,
  userData: UserData,
): Promise<UserProfileNames> {
  const userDoc = await new UserRegistry(dbh.db).getUserByUID(userData.uid);
  if (!userDoc) {
    throw new Error(
      `Failed to load user document for uid '${userData.uid}' to preload profile`,
    );
  }
  return userProfileNamesSchema.parse({
    ...(userDoc.username !== undefined ? { username: userDoc.username } : {}),
    ...(userDoc.first_name !== undefined
      ? { first_name: userDoc.first_name }
      : {}),
    ...(userDoc.middle_name !== undefined
      ? { middle_name: userDoc.middle_name }
      : {}),
    ...(userDoc.last_name !== undefined
      ? { last_name: userDoc.last_name }
      : {}),
    ...(userDoc.display_name !== undefined
      ? { display_name: userDoc.display_name }
      : {}),
  });
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

  const [appsResult, orgsResult, adminOnlyOrgCreationResult, profileResult] =
    await withServerTrace({
      op_name: "GET /account (preload data)",
      op_category: "subroutine",
      event_id: crypto.randomUUID(),
      callback: async () =>
        await Promise.allSettled([
          attemptToPreloadAppsAndDomains(dbh, user),
          attemptToPreloadUserOrganizationMemberships(dbh, user),
          adminOnlyOrganizationCreation(dbh.db, redis.client),
          attemptToPreloadUserProfile(dbh, user),
        ]),
    });

  const preloaded_authorized_apps =
    appsResult.status === "fulfilled" ? appsResult.value : undefined;
  const preloaded_organization_memberships =
    orgsResult.status === "fulfilled" ? orgsResult.value : undefined;
  // On preload failure the profile card fetches from
  // GET /api/user/profile client-side instead.
  const preloaded_user_profile =
    profileResult.status === "fulfilled" ? profileResult.value : undefined;

  if (appsResult.status === "rejected") {
    console.error("Failed to preload authorized apps:", appsResult.reason);
  }
  if (orgsResult.status === "rejected") {
    console.error(
      "Failed to preload user organization memberships:",
      orgsResult.reason,
    );
  }
  if (profileResult.status === "rejected") {
    console.error("Failed to preload user profile:", profileResult.reason);
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
      preloaded_user_profile={preloaded_user_profile}
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
