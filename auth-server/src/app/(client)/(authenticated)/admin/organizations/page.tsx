import "server-only";

import AdminOrganizationsPageView from "./admin_organizations_page_view";
import type { ReactElement } from "react";
import {
  type IProtectedAdminServerComponentPageProps,
  withAdminServerComponentRouteGuard,
} from "@/lib/withAdminRouteGuard";
import {
  listUserOrganizationMembershipDetails,
  OrganizationsRegistry,
} from "@/lib/auth-db";
import type { ServerRuntime } from "next";
import type {
  OrganizationDefinition,
  OrganizationMembershipRoleDetails,
} from "@schemavaults/auth-common";
import { connection } from "next/server";

async function PreloadedOrganizationsPage({
  user,
  dbh,
}: IProtectedAdminServerComponentPageProps): Promise<ReactElement> {
  if (!user.admin) {
    throw new Error(
      "Expected user to have been asserted to be an admin by this point!",
    );
  }

  const registry = new OrganizationsRegistry(dbh.db);

  const [organizationsResult, myMembershipsResult] = await Promise.allSettled([
    registry.listAllOrganizations(),
    listUserOrganizationMembershipDetails(dbh.db, {
      uid: user.uid,
      admin: true,
    }),
  ]);

  if (organizationsResult.status === "rejected") {
    throw organizationsResult.reason;
  }
  const organizations: readonly OrganizationDefinition[] =
    organizationsResult.value;

  // On failure the "Your organizations" stat card fetches from
  // GET /api/me/organizations client-side instead.
  let preloaded_my_memberships:
    | readonly OrganizationMembershipRoleDetails[]
    | undefined;
  if (myMembershipsResult.status === "fulfilled") {
    preloaded_my_memberships = myMembershipsResult.value;
  } else {
    console.error(
      "Failed to preload the admin's own organization memberships for /admin/organizations:",
      myMembershipsResult.reason,
    );
  }

  return (
    <AdminOrganizationsPageView
      preloaded={organizations}
      preloaded_my_memberships={preloaded_my_memberships}
    />
  );
}

async function OrganizationsServerComponent(): Promise<ReactElement> {
  await connection();
  return await withAdminServerComponentRouteGuard(PreloadedOrganizationsPage);
}

export default OrganizationsServerComponent;

export const runtime: ServerRuntime = "nodejs";
