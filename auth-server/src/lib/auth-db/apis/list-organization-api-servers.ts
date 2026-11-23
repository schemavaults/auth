import "server-only";
import type { Kysely, Transaction } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import { organizationIdSchema, type OrganizationID, type UserData } from "@schemavaults/auth-common";
import {
  type SchemaVaultsApiServerDefinition,
  getHardcodedSchemaVaultsApis,
} from "@schemavaults/app-definitions";
import { getAuthServerOwnerOrganizationId } from "@/lib/config/auth-server-owner-organization";
import { parseApiServerDefinitionsFromDbRows } from "./parse-api-server-definition-database-rows";

/**
 * @description Lists the API servers an organization owns. The platform's
 * owner organization owns the platform-owned rows and the hardcoded API
 * servers.
 */
export async function listOrganizationApiServers(
  db: Kysely<AuthDatabase> | Transaction<AuthDatabase>,
  org_id: OrganizationID,
  user: UserData,
): Promise<readonly SchemaVaultsApiServerDefinition[]> {

  const parsed_org_id = organizationIdSchema.safeParse(org_id);
  if (!parsed_org_id.success) {
    throw new TypeError("Invalid organization ID to list API servers for!", {
      cause: parsed_org_id.error,
    })
  }

  if (!user) {
    throw new Error("You must be logged in to list API servers");
  }


  const ownerOrganizationId: OrganizationID = getAuthServerOwnerOrganizationId();

  const loadOrgApiServerDefinitionsFromDb = async (organization_id: OrganizationID): Promise<readonly SchemaVaultsApiServerDefinition[]> => {
    let rows: unknown[];
    try {
      // The platform's virtual organization "owns" the platform-owned rows
      // (owner_type = 'platform'); user-owned rows also have a NULL owner
      // organization, so the discriminant — not the NULL — selects them.
      rows = await db
        .selectFrom("api_servers")
        .where((eb) =>
          organization_id === ownerOrganizationId
            ? eb("owner_type", "=", "platform")
            : eb.and([
                eb("owner_type", "=", "organization"),
                eb("owner_organization_id", "=", organization_id),
              ])
        )
        .limit(100)
        .selectAll()
        .execute();
    } catch (e: unknown) {
      console.error(`Failed to list API servers for organization with ID '${organization_id}':`, e);
      throw new Error(`Failed to list API servers for organization with ID: '${organization_id}'`, { cause: e });
    }

    return await parseApiServerDefinitionsFromDbRows(rows);
  }

  const api_server_definitions: SchemaVaultsApiServerDefinition[] = []

  try {
    api_server_definitions.push(...await loadOrgApiServerDefinitionsFromDb(org_id))
  } catch (e: unknown) {
    console.error(e);
    throw new Error(
      "Failed to parse the API servers data received from database",
      { cause: e },
    );
  }

  if (org_id === ownerOrganizationId) {
    api_server_definitions.push(...getHardcodedSchemaVaultsApis().filter(s => s.owner_organization_id === ownerOrganizationId))
  }

  return api_server_definitions;
}

export default listOrganizationApiServers;
