import "server-only";

import type { Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import SchemaVaultsApiServerRegistry from "@/lib/auth-db/apis";
import type { UserData } from "@schemavaults/auth-common";
import type { OrganizationMembershipRoleType } from "@/lib/auth-db/organizations";
import type { SchemaVaultsApiServerDefinition } from "@schemavaults/app-definitions";
import {
  getUserAccessLevelForResource,
  type OwnedResourceAccessLevel,
} from "@/lib/ownership/resource-access";

const DEFAULT_ROLES: readonly OrganizationMembershipRoleType[] = ['owner', 'admin'];

/**
 * @name hasUserAccessToApiServer
 * @param user The user to check
 * @param api_server_id The API server ID
 * @param db Database handle
 * @param roles Accepted access roles. Defaults to ['owner', 'admin'] —
 * i.e. only organization owners/admins (or global admins) pass. Pass
 * ['owner', 'admin', 'member'] for read-only flows where any member
 * legitimately has access.
 * @returns A promise resolving to true if the user's access level for the
 * API server (see `getUserAccessLevelForResource`) is one of the accepted
 * roles. Organization-owned API servers map the user's organization role;
 * user-owned API servers grant their owning user the 'owner' role; global
 * admins are always 'owner'.
 */
export async function hasUserAccessToApiServer(
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

  const level: OwnedResourceAccessLevel = await getUserAccessLevelForResource(db, user, apiServer);
  if (level === "none") {
    return false;
  }
  return roles.includes(level);
}

/**
 * @deprecated Renamed to {@link hasUserAccessToApiServer}: API servers may
 * now be owned by a user account rather than an organization.
 */
export const isUserInApiOwnerOrganization = hasUserAccessToApiServer;

export default hasUserAccessToApiServer;
