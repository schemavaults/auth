import "server-only";
import type { ReactElement } from "react";

import OrgsPageView from "./orgs_page_view";
import {
  type IProtectedAuthenticatedServerComponentPageProps,
  withAuthenticatedServerComponentRouteGuard,
} from "@/lib/withAuthenticatedRouteGuard";
import {
  listUserOrganizationMembershipDetails,
  listUserPendingInvitations,
} from "@/lib/auth-db/organizations";
import adminOnlyOrganizationCreation from "@/lib/config/admin-only-organization-creation";
import { withServerTrace } from "@/lib/withServerTrace";
import { connection } from "next/server";
import type { ServerRuntime } from "next";

async function UserOrganizationsPageServerComponent({
  user,
  dbh,
  redis,
}: IProtectedAuthenticatedServerComponentPageProps): Promise<ReactElement> {
  const [membershipsResult, invitationsResult, adminOnlyOrgCreationResult] =
    await withServerTrace({
      op_name: "GET /orgs (preload data)",
      op_category: "subroutine",
      event_id: crypto.randomUUID(),
      callback: async () =>
        await Promise.allSettled([
          listUserOrganizationMembershipDetails(dbh.db, {
            uid: user.uid,
            admin: user.admin ?? false,
          }),
          listUserPendingInvitations(dbh.db, user.uid),
          adminOnlyOrganizationCreation(dbh.db, redis.client),
        ]),
    });

  // On preload failure the cards fall back to fetching client-side from
  // GET /api/me/organizations and GET /api/me/invitations.
  const preloaded_memberships =
    membershipsResult.status === "fulfilled"
      ? membershipsResult.value
      : undefined;
  const preloaded_invitations =
    invitationsResult.status === "fulfilled"
      ? invitationsResult.value
      : undefined;

  if (membershipsResult.status === "rejected") {
    console.error(
      "Failed to preload user organization memberships for /orgs:",
      membershipsResult.reason,
    );
  }
  if (invitationsResult.status === "rejected") {
    console.error(
      "Failed to preload pending organization invitations for /orgs:",
      invitationsResult.reason,
    );
  }
  if (adminOnlyOrgCreationResult.status === "rejected") {
    console.error(
      "Failed to load server setting for admin_only_organization_creation on /orgs:",
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
    <OrgsPageView
      preloaded_memberships={preloaded_memberships}
      preloaded_invitations={preloaded_invitations}
      can_create_organization={can_create_organization}
    />
  );
}

export default async function UserOrganizationsPage(): Promise<ReactElement> {
  await connection();
  return await withAuthenticatedServerComponentRouteGuard(
    UserOrganizationsPageServerComponent,
    { next_href: "/orgs" },
  );
}

export const runtime: ServerRuntime = "nodejs";
