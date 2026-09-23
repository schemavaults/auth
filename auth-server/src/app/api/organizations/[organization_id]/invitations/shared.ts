import type { UserData } from "@schemavaults/auth-common";
import type { OrganizationID } from "@schemavaults/auth-common/organizations";
import type { Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import { OrganizationsRegistry } from "@/lib/auth-db/organizations";

export const INVITATIONS_ROUTE = "/api/organizations/{organization_id}/invitations";
export const INVITATION_ROUTE = "/api/organizations/{organization_id}/invitations/{invitation_id}";

/**
 * The access rule of the invitation management operations: the caller
 * must be a platform administrator or an owner of the organization.
 */
export async function isOrganizationOwnerOrPlatformAdmin(
  db: Kysely<AuthDatabase>,
  user: UserData,
  organization_id: OrganizationID,
): Promise<boolean> {
  if (user.admin) return true;
  const registry = new OrganizationsRegistry(db);
  const userMemberships = await registry.listUserOrganizationMemberships(user.uid, user.admin ?? false);
  const userMembership = userMemberships.find((m) => m.organization_id === organization_id);
  return userMembership !== undefined && userMembership.role === "owner";
}
