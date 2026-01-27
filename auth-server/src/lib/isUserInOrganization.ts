import "server-only";

import type { Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "./auth-db/auth-database-types";
import { type OrganizationMembershipRoleDefinition, type OrganizationMembershipRoleType, organizationMembershipRoleTypeSchema, OrganizationsRegistry } from "./auth-db/organizations";
import { organizationIdSchema, SCHEMAVAULTS_ORGANIZATION_ID, type OrganizationID, type UserData } from "@schemavaults/auth-common";

/**
 * Check if a user is a member of an organization
 * @param uid - The user's unique identifier
 * @param organization_id - The organization ID to check membership for
 * @param db - The database connection
 * @returns true if the user is a member of the organization
 */
export async function isUserInOrganization(
  user: UserData,
  organization_id: OrganizationID,
  db: Kysely<AuthDatabase>,
): Promise<boolean> {
  if (!organizationIdSchema.safeParse(organization_id).success) {
    throw new TypeError("Invalid organization ID to check if user is a member of!")
  }

  const { uid, admin } = user;

  if (organization_id === SCHEMAVAULTS_ORGANIZATION_ID && !admin) {
    return false;
  }

  const organizationsRegistry = new OrganizationsRegistry(db);
  const userMembershipIds = await organizationsRegistry.listUserOrganizationMembershipIds(
    uid,
    admin ?? false
  );
  return userMembershipIds.includes(organization_id);
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
