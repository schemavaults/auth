import "server-only";
import type { Kysely, Transaction } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import {
  type SchemaVaultsApiServerDefinition,
  type ApiServerId,
  isHardcodedApiServerId,
  isValidApiServerId,
  organizationMembershipVisibilitySchema,
  type OrganizationMembershipVisibility,
} from "@schemavaults/app-definitions";
import { getApiServer } from "./get-api-server";

/**
 * @description Sets which organizations' memberships the API server may
 * look up on the resource-server endpoints (migration 00045). Only
 * platform administrators may call the route that uses this; hardcoded
 * API servers have no row and cannot be updated.
 */
export async function setApiServerOrganizationMembershipVisibility(
  db: Kysely<AuthDatabase> | Transaction<AuthDatabase>,
  api_server_id: ApiServerId,
  visibility: OrganizationMembershipVisibility,
  debug: boolean = false,
): Promise<SchemaVaultsApiServerDefinition | null> {
  if (!isValidApiServerId(api_server_id)) {
    throw new TypeError("Received invalid API server ID!");
  }
  if (isHardcodedApiServerId(api_server_id)) {
    throw new Error("Cannot update the organization membership visibility of a hardcoded API server");
  }
  const parsed_visibility = organizationMembershipVisibilitySchema.safeParse(visibility);
  if (!parsed_visibility.success) {
    throw new TypeError("Received invalid 'organization_membership_visibility'!", {
      cause: parsed_visibility.error,
    });
  }
  const organization_membership_visibility: OrganizationMembershipVisibility =
    parsed_visibility.data;
  await db
    .updateTable("api_servers")
    .set({ organization_membership_visibility })
    .where("api_server_id", "=", api_server_id)
    .execute();
  return await getApiServer(db, api_server_id, debug);
}

export default setApiServerOrganizationMembershipVisibility;
