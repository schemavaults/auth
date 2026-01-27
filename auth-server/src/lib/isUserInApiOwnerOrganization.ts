import "server-only";

import type { Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import SchemaVaultsApiServerRegistry from "@/lib/auth-db/apis";
import type { OrganizationID, UserData } from "@schemavaults/auth-common";
import isUserInOrganization from "@/lib/isUserInOrganization";

/**
 * @name isUserInApiOwnerOrganization
 * @param uid The user ID
 * @param api_server_id The API server ID
 * @param db Database handle
 * @returns A promise resolving to true if user with ID 'uid' is in an organization that owns API server with ID 'api_server_id'
 */
export default async function isUserInApiOwnerOrganization(
  user: UserData,
  api_server_id: string,
  db: Kysely<AuthDatabase>
): Promise<boolean> {
  const apiServerRegistry = new SchemaVaultsApiServerRegistry(db);
  const apiServer = await apiServerRegistry.getApiServer(api_server_id);

  if (!apiServer.owner_organization_id) {
    console.warn(`[isUserInOwnerOrganization] No owner organization found for API server: '${api_server_id}'`)
    return false;
  }

  const owner_organization_id: OrganizationID = apiServer.owner_organization_id;
  return await isUserInOrganization(
    user,
    owner_organization_id,
    db
  );
}
