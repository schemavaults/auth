import "server-only";

import type { Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import SchemaVaultsApiServerRegistry from "@/lib/auth-db/apis";
import type { OrganizationID, UserData } from "@schemavaults/auth-common";
import isUserInOrganization from "@/lib/isUserInOrganization";
import type { SchemaVaultsApiServerDefinition } from "@schemavaults/app-definitions";

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
  const apiServer: SchemaVaultsApiServerDefinition | null = await apiServerRegistry.getApiServer(api_server_id);

  if (!apiServer) {
    throw new Error(`No API server found with 'api_server_id': '${api_server_id}'`)
  }

  if (!apiServer.owner_organization_id) {
    console.warn(`[isUserInOwnerOrganization] No owner organization found for API server: '${api_server_id}'`)
    return false;
  }

  const owner_organization_id: OrganizationID = apiServer.owner_organization_id;
  const role = await isUserInOrganization(
    db,
    user,
    owner_organization_id
  );
  return role === 'admin' || role === 'owner' || role === 'member';
}
