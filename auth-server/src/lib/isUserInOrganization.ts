import "server-only";

import type { Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "./auth-db/auth-database-types";
import { type OrganizationMembershipRoleDefinition, type OrganizationMembershipRoleType, organizationMembershipRoleTypeSchema, OrganizationsRegistry } from "./auth-db/organizations";
import { organizationIdSchema, SCHEMAVAULTS_ORGANIZATION_ID, type OrganizationID, type UserData } from "@schemavaults/auth-common";

/**
 * Check if a user is a member of an organization
 * @param user - The user data
 * @param organization_id - The organization ID to check membership for
 * @param db - The database connection
 * @returns false if the user is not a member, or the role name string if they are
 */
export async function isUserInOrganization(
  db: Kysely<AuthDatabase>,
  user: UserData,
  organization_id: OrganizationID,
): Promise<OrganizationMembershipRoleType | false> {
  if (!organizationIdSchema.safeParse(organization_id).success) {
    throw new TypeError("Invalid organization ID to check if user is a member of!")
  }

  const { uid, admin } = user;

  if (organization_id === SCHEMAVAULTS_ORGANIZATION_ID && !admin) {
    return false;
  }

  const organizationsRegistry = new OrganizationsRegistry(db);
  const userMemberships: readonly OrganizationMembershipRoleDefinition[] = await organizationsRegistry.listUserOrganizationMemberships(
    uid,
    admin ?? false
  );
  const membership = userMemberships.find(m => m.organization_id === organization_id);
  if (!membership) {
    return false;
  }
  return membership.role;
}

export default isUserInOrganization;

export async function isUserInOrganizationWithRole(
  user: UserData,
  organization_id: OrganizationID,
  role: OrganizationMembershipRoleType,
  db: Kysely<AuthDatabase>,
): Promise<boolean> {
  if (!organizationIdSchema.safeParse(organization_id).success) {
    throw new TypeError("Invalid organization ID to check if user is a member of!")
  } else if (!organizationMembershipRoleTypeSchema.safeParse(role).success) {
    throw new TypeError("Invalid role to check if user is a member of!")
  }

  const { uid, admin } = user;

  if (organization_id === SCHEMAVAULTS_ORGANIZATION_ID && !admin) {
    return false;
  }

  const organizationsRegistry = new OrganizationsRegistry(db);
  const userMemberships: readonly OrganizationMembershipRoleDefinition[] = await organizationsRegistry.listUserOrganizationMemberships(
    uid,
    admin ?? false
  );
  return userMemberships.some(membership => membership.organization_id === organization_id && membership.role === role);
}
