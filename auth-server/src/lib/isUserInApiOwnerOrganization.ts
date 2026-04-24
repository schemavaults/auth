import "server-only";

import type { Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import SchemaVaultsApiServerRegistry from "@/lib/auth-db/apis";
import type { OrganizationID, UserData } from "@schemavaults/auth-common";
import { isUserInOrganizationWithRole } from "@/lib/isUserInOrganization";
import type { OrganizationMembershipRoleType } from "@/lib/auth-db/organizations";
import type { SchemaVaultsApiServerDefinition } from "@schemavaults/app-definitions";

const DEFAULT_ROLES: readonly OrganizationMembershipRoleType[] = ['owner', 'admin'];

/**
 * @name isUserInApiOwnerOrganization
 * @param user The user to check
 * @param api_server_id The API server ID
 * @param db Database handle
 * @param roles Accepted organization roles. Defaults to ['owner', 'admin'] —
 * i.e. only organization owners (and the virtual SchemaVaults-org admin role)
 * pass. Pass ['owner', 'admin', 'member'] for read-only flows where any
 * member legitimately has access.
 * @returns A promise resolving to true if the user has one of the accepted
 * roles in the organization that owns the given API server.
 */
export default async function isUserInApiOwnerOrganization(
  user: UserData,
  api_server_id: string,
  db: Kysely<AuthDatabase>,
  roles: readonly OrganizationMembershipRoleType[] = DEFAULT_ROLES,
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
  return await isUserInOrganizationWithRole(user, owner_organization_id, roles, db);
}
