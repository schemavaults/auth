import "server-only";
import type { Kysely, Transaction } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import type { SchemaVaultsApp } from "@schemavaults/app-definitions";
import type { UserData } from "@schemavaults/auth-common";
import { listUserOrganizationMemberships } from "@/lib/auth-db/organizations/list-user-organization-memberships";
import listApps from "./list-apps";
import parseAppDefinitionDatabaseRow from "./parse-app-definition-database-row";

/**
 * @description Lists every app the user can reach by ownership: apps owned
 * by their own account, apps owned by organizations they belong to (any
 * role), and — for global admins — every app including platform-owned and
 * hardcoded ones. Backs the `/apps` page.
 */
export async function listAppsAccessibleToUser(
  db: Kysely<AuthDatabase> | Transaction<AuthDatabase>,
  user: UserData,
  debug: boolean = false,
): Promise<SchemaVaultsApp[]> {
  if (!user) {
    throw new Error("You must be logged in to list apps");
  }
  if (user.admin === true) {
    return await listApps(db, "all", user, debug);
  }

  const memberships = await listUserOrganizationMemberships(
    db,
    user.uid,
    false,
  );
  const organization_ids: string[] = [
    ...new Set(memberships.map((m) => m.organization_id)),
  ];

  const MAX_PAGE_SIZE: number = 100;

  let rows: unknown[];
  try {
    rows = await db
      .selectFrom("apps")
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
      .limit(MAX_PAGE_SIZE)
      .selectAll()
      .execute();
  } catch (e: unknown) {
    console.error(`Failed to list apps accessible to user '${user.uid}':`, e);
    throw new Error("Failed to list apps accessible to user");
  }

  return rows.map((row) => parseAppDefinitionDatabaseRow(row));
}

export default listAppsAccessibleToUser;
