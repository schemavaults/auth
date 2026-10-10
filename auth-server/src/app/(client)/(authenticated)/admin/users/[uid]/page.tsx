import "server-only";

import AdminUserDetailPageView from "./admin_user_detail_page_view";
import type { ReactElement } from "react";
import {
  type IProtectedAdminServerComponentPageProps,
  withAdminServerComponentRouteGuard,
} from "@/lib/withAdminRouteGuard";
import { UserRegistry, loadUserData } from "@/lib/auth-db";
import {
  OrganizationsRegistry,
  getVirtualOrganizationMembershipSource,
} from "@/lib/auth-db/organizations";
import redirectWithError from "@/lib/redirect-with-error";
import reportServerException from "@/lib/reportServerException";
import type { ServerRuntime } from "next";
import { z } from "zod";
import {
  getHardcodedOrgs,
  type OrganizationID,
  type UserData,
} from "@schemavaults/auth-common";
import { connection } from "next/server";
import type {
  AdminUserAssignableOrganization,
  AdminUserOrganizationMembershipRow,
} from "./admin_user_organizations_card";

const uidSchema = z.guid();

async function PreloadedAdminUserDetailPage(
  { user, dbh }: IProtectedAdminServerComponentPageProps,
  pageParams: PageProps<"/admin/users/[uid]">,
): Promise<ReactElement> {
  if (!user.admin) {
    throw new Error(
      "Expected user to have been asserted to be an admin by this point!",
    );
  }

  const { uid: uid_param } = await pageParams.params;
  const parsed_uid = await uidSchema.safeParseAsync(uid_param);
  if (!parsed_uid.success) {
    redirectWithError(400, "bad_request");
  }
  const uid: string = parsed_uid.data;

  const registry = new UserRegistry(dbh.db);
  let targetUser: UserData;
  try {
    targetUser = await loadUserData(uid, registry);
  } catch (e: unknown) {
    console.error(
      `[AdminUserDetailPage] Failed to load user '${uid}': `,
      e,
    );
    redirectWithError(400, "bad_request");
  }

  const organizationMemberships: readonly AdminUserOrganizationMembershipRow[] | null =
    await loadOrganizationMembershipRows(dbh.db, targetUser);
  const assignableOrganizations: readonly AdminUserAssignableOrganization[] | null =
    targetUser.service_account === true || organizationMemberships === null
      ? null
      : await loadAssignableOrganizations(dbh.db, organizationMemberships);

  return (
    <AdminUserDetailPageView
      user={targetUser}
      sessionUid={user.uid}
      organizationMemberships={organizationMemberships}
      assignableOrganizations={assignableOrganizations}
    />
  );
}

/**
 * The organizations the target user could be added to directly: every
 * organization except system organizations (membership there follows the
 * admin flag) and the ones they already belong to. Returns null (no "Add
 * to organization" action) if the organizations could not be listed.
 */
async function loadAssignableOrganizations(
  db: ConstructorParameters<typeof OrganizationsRegistry>[0],
  memberships: readonly AdminUserOrganizationMembershipRow[],
): Promise<readonly AdminUserAssignableOrganization[] | null> {
  const excluded = new Set<OrganizationID>([
    ...getHardcodedOrgs().map((org) => org.organization_id),
    ...memberships.map((membership) => membership.organization_id),
  ]);
  try {
    const organizations = await new OrganizationsRegistry(db).listAllOrganizations();
    return organizations
      .filter((org) => !excluded.has(org.organization_id))
      .map((org) => ({ organization_id: org.organization_id, name: org.name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch (e: unknown) {
    console.error(
      "[AdminUserDetailPage] Failed to list organizations for the add to organization dialog: ",
      e,
    );
    await reportServerException(e, {
      op_name: "AdminUserDetailPage.loadAssignableOrganizations",
      route: "/admin/users/[uid]",
      context: { nonFatal: true },
    });
    return null;
  }
}

/**
 * Loads the target user's organization memberships (including the virtual
 * owner-organization membership derived from the admin flag, and a service
 * account's virtual membership of its app's organization) and resolves
 * each organization's display name. Returns null if the memberships could
 * not be loaded, so the view can show an error state instead of an empty
 * list.
 */
async function loadOrganizationMembershipRows(
  db: ConstructorParameters<typeof OrganizationsRegistry>[0],
  targetUser: UserData,
): Promise<readonly AdminUserOrganizationMembershipRow[] | null> {
  const orgsRegistry = new OrganizationsRegistry(db);

  try {
    const memberships = await orgsRegistry.listUserOrganizationMemberships(
      targetUser.uid,
      targetUser.admin === true,
    );

    const distinctOrgIds: readonly OrganizationID[] = [
      ...new Set(memberships.map((membership) => membership.organization_id)),
    ];
    const organizationNames = new Map<OrganizationID, string>(
      await Promise.all(
        distinctOrgIds.map(
          async (org_id): Promise<[OrganizationID, string]> => {
            try {
              const org = await orgsRegistry.lookupOrganization(org_id);
              return [org_id, org.name];
            } catch (e: unknown) {
              console.error(
                `[AdminUserDetailPage] Failed to lookup organization '${org_id}': `,
                e,
              );
              await reportServerException(e, {
                op_name: "AdminUserDetailPage.lookupOrganization",
                route: "/admin/users/[uid]",
                context: {
                  organization_id: org_id,
                  target_uid: targetUser.uid,
                  nonFatal: true,
                },
              });
              // Fall back to displaying the ID as the name
              return [org_id, org_id];
            }
          },
        ),
      ),
    );

    return memberships
      .map(
        (membership): AdminUserOrganizationMembershipRow => ({
          membership_declaration_id: membership.membership_declaration_id,
          organization_id: membership.organization_id,
          organization_name:
            organizationNames.get(membership.organization_id) ??
            membership.organization_id,
          role: membership.role,
          membership_created_at: membership.created_at,
          virtual: getVirtualOrganizationMembershipSource(
            membership.membership_declaration_id,
          ),
        }),
      )
      .sort((a, b) => b.membership_created_at - a.membership_created_at);
  } catch (e: unknown) {
    console.error(
      `[AdminUserDetailPage] Failed to load organization memberships for user '${targetUser.uid}': `,
      e,
    );
    await reportServerException(e, {
      op_name: "AdminUserDetailPage.loadOrganizationMembershipRows",
      route: "/admin/users/[uid]",
      context: { target_uid: targetUser.uid, nonFatal: true },
    });
    return null;
  }
}

export default async function AdminUserDetailPage(
  pageParams: PageProps<"/admin/users/[uid]">,
): Promise<ReactElement> {
  await connection();
  const { uid } = await pageParams.params;
  // Only forward a next_href when the uid is a well-formed UUID; a
  // malformed uid would 400 after login anyway, so the login redirect
  // carries no destination in that case.
  const parsed_uid = uidSchema.safeParse(uid);
  return await withAdminServerComponentRouteGuard(
    (props) => PreloadedAdminUserDetailPage(props, pageParams),
    parsed_uid.success
      ? { next_href: `/admin/users/${parsed_uid.data}` }
      : undefined,
  );
}

export const runtime: ServerRuntime = "nodejs";
