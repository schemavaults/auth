import "server-only";

import type { Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import SchemaVaultsApiServerRegistry from "@/lib/auth-db/apis";
import OrganizationsRegistry from "@/lib/auth-db/organizations";

/**
 * @name isUserInApiOwnerOrganization
 * @param uid The user ID
 * @param api_server_id The API server ID
 * @param db Database handle
 * @returns A promise resolving to true if user with ID 'uid' is in an organization that owns API server with ID 'api_server_id'
 */
export default async function isUserInApiOwnerOrganization(
  uid: string,
  api_server_id: string,
  db: Kysely<AuthDatabase>
): Promise<boolean> {
  const apiServerRegistry = new SchemaVaultsApiServerRegistry(db);
  const apiServer = await apiServerRegistry.getApiServer(api_server_id);

  if (!apiServer.owner_organization_id) {
    console.warn(`[isUserInOwnerOrganization] No owner organization found for API server: '${api_server_id}'`)
    return false;
  }

  const organizationsRegistry = new OrganizationsRegistry(db);
  const memberships = await organizationsRegistry.listUserOrganizationMemberships(uid);

  return memberships.includes(apiServer.owner_organization_id);
}
