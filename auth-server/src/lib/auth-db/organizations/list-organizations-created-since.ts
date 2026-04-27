import "server-only";

import {
  organizationDefinitionSchema,
  type OrganizationDefinition,
} from "@schemavaults/auth-common";
import type { Kysely, Transaction } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import type { OrganizationRow } from "./organizations-table";

export async function listOrganizationsCreatedSince(
  db: Kysely<AuthDatabase> | Transaction<AuthDatabase>,
  since_ms: number,
): Promise<readonly OrganizationDefinition[]> {
  const rows: OrganizationRow[] = await db
    .selectFrom("organizations")
    .selectAll()
    .where("created_at", ">", since_ms)
    .orderBy("created_at", "desc")
    .execute();

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
    organizations.push(parsed.data);
  }

  return organizations;
}

export default listOrganizationsCreatedSince;
