import type { Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "./auth-db/auth-database-types";
import { OrganizationsRegistry } from "./auth-db/organizations";
import type { OrganizationID, UserData } from "@schemavaults/auth-common";

/**
 * Check if a user is a member of an organization
 * @param uid - The user's unique identifier
 * @param organization_id - The organization ID to check membership for
 * @param db - The database connection
 * @param isAdmin - Whether the user is an admin (admins have access to all organizations)
 * @returns true if the user is a member of the organization
 */
export async function isUserInOrganization(
  user: UserData,
  organization_id: OrganizationID,
  db: Kysely<AuthDatabase>,
): Promise<boolean> {
  const { uid, admin } = user;

  const organizationsRegistry = new OrganizationsRegistry(db);
  const userMemberships = await organizationsRegistry.listUserOrganizationMemberships(
    uid,
    admin ?? false
  );
  return userMemberships.includes(organization_id);
}

export default isUserInOrganization;
