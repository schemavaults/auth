import "server-only";

import { hardcodedOrgs, organizationDefinitionSchema, type OrganizationID, type OrganizationDefinition } from "@schemavaults/auth-common";
import type { OrganizationRow } from "./organizations-table";
import type { Kysely, Transaction } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";

const hardcodedOrgIds: Set<OrganizationID> = new Set(hardcodedOrgs.map(o => o.organization_id))

export async function listAllOrganizations(
  db: Kysely<AuthDatabase> | Transaction<AuthDatabase>,
  debug: boolean = false
): Promise<readonly OrganizationDefinition[]> {

  if (debug) {
    console.log(`[OrganizationsRegistry] listAllOrganizations()`);
  }

  const query = db
    .selectFrom("organizations")
    .selectAll()
    .orderBy("created_at", "desc");

  const rows: OrganizationRow[] = await query.execute();

  const organizations: OrganizationDefinition[] = [];
  for (const row of rows) {
    const parsed = await organizationDefinitionSchema.safeParseAsync({
      ...row,
      created_at:
        typeof row.created_at === "number"
          ? row.created_at
          : Number.parseInt(row.created_at),
    } satisfies OrganizationDefinition);
    if (!parsed.success) {
      console.error(
        "Failed to parse organization definition from database row: ",
        parsed.error,
      );
      continue;
    }
    if (hardcodedOrgIds.has(parsed.data.organization_id)) {
      throw new Error("Found an organization row in database with a hardcoded organization ID!")
    }
    organizations.push(parsed.data);
  }

  organizations.push(...hardcodedOrgs satisfies readonly OrganizationDefinition[]);

  if (debug) {
    console.log(
      `[OrganizationsRegistry] listAllOrganizations() => ${organizations.length} organizations`,
    );
  }

  return organizations;
}

export default listAllOrganizations;
