import type { Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "./auth-db/auth-database-types";
import { OrganizationsRegistry } from "./auth-db/organizations";
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
  const userMemberships = await organizationsRegistry.listUserOrganizationMemberships(
    uid,
    admin ?? false
  );
  return userMemberships.includes(organization_id);
}

export default isUserInOrganization;
