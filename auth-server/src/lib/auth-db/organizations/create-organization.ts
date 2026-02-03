import "server-only";

import { hardcodedOrgs, type OrganizationDefinition, organizationDefinitionSchema, SCHEMAVAULTS_ORGANIZATION_ID } from "@schemavaults/auth-common";
import type { Kysely, Transaction } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";

export async function createOrganization(
  db: Kysely<AuthDatabase> | Transaction<AuthDatabase>,
  org_def: OrganizationDefinition,
  debug: boolean = false
): Promise<void> {
  const parsedOrgDef =
    await organizationDefinitionSchema.safeParseAsync(org_def);
  if (!parsedOrgDef.success) {
    console.error(
      "Failed to parse organization definition for database insert: ",
      parsedOrgDef.error,
    );
    throw new Error(
      "Failed to parse organization definition for database insert!",
    );
  }
  const organization_definition: OrganizationDefinition = parsedOrgDef.data;

  function isReservedId() {
    if (organization_definition.organization_id === SCHEMAVAULTS_ORGANIZATION_ID) {
      return true;
    }

    if (hardcodedOrgs.some(
      (hardcodedOrganization): boolean => (
        hardcodedOrganization.organization_id === organization_definition.organization_id
      )
    )) {
      return true;
    }

    return false;
  }

  if (isReservedId()) {
    throw new Error(
      `'${organization_definition.organization_id}' is a reserved organization ID!`,
    );
  }

  if (debug) {
    console.log(
      `[OrganizationsRegistry] createOrganization(${JSON.stringify(organization_definition)})`,
    );
  }

  if (!organization_definition.created_by) {
    throw new TypeError("Missing 'created_by' field for new organization!")
  }

  const insertionQuery = db
    .insertInto("organizations")
    .values(organization_definition);

  await insertionQuery.executeTakeFirstOrThrow();
}

export default createOrganization;
