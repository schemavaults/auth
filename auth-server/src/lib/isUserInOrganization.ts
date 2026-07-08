import "server-only";

import type { Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "./auth-db/auth-database-types";
import { type OrganizationMembershipRoleDefinition, type OrganizationMembershipRoleType, organizationMembershipRoleTypeSchema, OrganizationsRegistry } from "./auth-db/organizations";
import { isValidOrganizationID, organizationIdSchema, userDataSchema, type OrganizationID, type UserData } from "@schemavaults/auth-common";
import { getAuthServerOwnerOrganizationId } from "@/lib/config/auth-server-owner-organization";

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
  if (!(await userDataSchema.safeParseAsync(user)).success) {
    throw new TypeError("Invalid user object to check organization membership for!")
  }
  if (!isValidOrganizationID(organization_id)) {
    throw new TypeError("Invalid organization ID to check if user is a member of!")
  }

  const { uid, admin } = user;

  const ownerOrganizationId: OrganizationID = getAuthServerOwnerOrganizationId();

  if (organization_id === ownerOrganizationId && !admin) {
    return false;
  }

  if (organization_id === ownerOrganizationId && typeof admin === 'boolean' && admin) {
    return 'admin' satisfies OrganizationMembershipRoleType;
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
  role: OrganizationMembershipRoleType | readonly OrganizationMembershipRoleType[],
  db: Kysely<AuthDatabase>,
): Promise<boolean> {
  if (!organizationIdSchema.safeParse(organization_id).success) {
    throw new TypeError("Invalid organization ID to check if user is a member of!")
  }

  const roles: readonly OrganizationMembershipRoleType[] = Array.isArray(role) ? role : [role as OrganizationMembershipRoleType];
  if (roles.length === 0) {
    throw new TypeError("At least one role must be provided to check if user is a member of!")
  }
  for (const r of roles) {
    if (!organizationMembershipRoleTypeSchema.safeParse(r).success) {
      throw new TypeError("Invalid role to check if user is a member of!")
    }
  }

  const { uid, admin } = user;

  if (organization_id === getAuthServerOwnerOrganizationId()) {
    if (!admin) {
      return false;
    }
    return roles.includes('admin');
  }

  const organizationsRegistry = new OrganizationsRegistry(db);
  const userMemberships: readonly OrganizationMembershipRoleDefinition[] = await organizationsRegistry.listUserOrganizationMemberships(
    uid,
    admin ?? false
  );
  return userMemberships.some(membership => membership.organization_id === organization_id && roles.includes(membership.role));
}
