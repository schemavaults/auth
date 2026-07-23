import "server-only";

import AdminUserDetailPageView from "./admin_user_detail_page_view";
import type { ReactElement } from "react";
import {
  type IProtectedAdminServerComponentPageProps,
  withAdminServerComponentRouteGuard,
} from "@/lib/withAdminRouteGuard";
import { UserRegistry, loadUserData } from "@/lib/auth-db";
import { OrganizationsRegistry } from "@/lib/auth-db/organizations";
import redirectWithError from "@/lib/redirect-with-error";
import type { ServerRuntime } from "next";
import { z } from "zod";
import type { OrganizationID, UserData } from "@schemavaults/auth-common";
import { connection } from "next/server";
import type { AdminUserOrganizationMembershipRow } from "./admin_user_organizations_card";

const uidSchema = z.string().uuid();

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

  return (
    <AdminUserDetailPageView
      user={targetUser}
      sessionUid={user.uid}
      organizationMemberships={organizationMemberships}
    />
  );
}

/**
 * Loads the target user's organization memberships (including the virtual
 * owner-organization membership derived from the admin flag) and resolves
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
          virtual: membership.membership_declaration_id.startsWith(
            "admin-virtual-",
          ),
        }),
      )
      .sort((a, b) => b.membership_created_at - a.membership_created_at);
  } catch (e: unknown) {
    console.error(
      `[AdminUserDetailPage] Failed to load organization memberships for user '${targetUser.uid}': `,
      e,
    );
    return null;
  }
}

export default async function AdminUserDetailPage(
  pageParams: PageProps<"/admin/users/[uid]">,
): Promise<ReactElement> {
  await connection();
  return await withAdminServerComponentRouteGuard((props) =>
    PreloadedAdminUserDetailPage(props, pageParams),
  );
}

export const runtime: ServerRuntime = "nodejs";
