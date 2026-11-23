import "server-only";
import type { Kysely, Transaction } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import type { UserData } from "@schemavaults/auth-common";
import type { SchemaVaultsApiServerDefinition } from "@schemavaults/app-definitions";
import { listUserOrganizationMemberships } from "@/lib/auth-db/organizations/list-user-organization-memberships";
import { listAllApiServers } from "./list-all-api-servers";
import { parseApiServerDefinitionsFromDbRows } from "./parse-api-server-definition-database-rows";

/**
 * @description Lists every API server the user can reach by ownership:
 * those owned by their own account, those owned by organizations they
 * belong to (any role), and — for global admins — every API server
 * including platform-owned and hardcoded ones. Backs the `/apis` page.
 */
export async function listApiServersAccessibleToUser(
  db: Kysely<AuthDatabase> | Transaction<AuthDatabase>,
  user: UserData,
): Promise<readonly SchemaVaultsApiServerDefinition[]> {
  if (!user) {
    throw new Error("You must be logged in to list API servers");
  }
  if (user.admin === true) {
    return await listAllApiServers(db);
  }

  const memberships = await listUserOrganizationMemberships(
    db,
    user.uid,
    false,
  );
  const organization_ids: string[] = [
    ...new Set(memberships.map((m) => m.organization_id)),
  ];

  let rows: unknown[];
  try {
    rows = await db
      .selectFrom("api_servers")
      .where((eb) =>
        eb.or([
          eb.and([
            eb("owner_type", "=", "user"),
            eb("owner_uid", "=", user.uid),
          ]),
          ...(organization_ids.length > 0
            ? [
                eb.and([
                  eb("owner_type", "=", "organization"),
                  eb("owner_organization_id", "in", organization_ids),
                ]),
              ]
            : []),
        ]),
      )
      .orderBy("created_at", "desc")
      .limit(100)
      .selectAll()
      .execute();
  } catch (e: unknown) {
    console.error(`Failed to list API servers accessible to user '${user.uid}':`, e);
    throw new Error("Failed to list API servers accessible to user", { cause: e });
  }

  return await parseApiServerDefinitionsFromDbRows(rows);
}

export default listApiServersAccessibleToUser;
