import "server-only";
import type { Kysely, Transaction } from "@schemavaults/dbh";
import { isHardcodedAppId, getHardcodedApp } from "@schemavaults/app-definitions";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";

/**
 * Human-readable names of the given client apps, keyed by app id. Hardcoded
 * apps (which have no APPS row) resolve to their built-in names; ids that
 * match no app are left out, so callers fall back to the id.
 */
export async function resolveAppNames(
  db: Kysely<AuthDatabase> | Transaction<AuthDatabase>,
  app_ids: readonly string[],
): Promise<Map<string, string>> {
  const nameById = new Map<string, string>();
  const dbAppIds: string[] = [];
  for (const app_id of new Set(app_ids)) {
    if (isHardcodedAppId(app_id)) {
      nameById.set(app_id, getHardcodedApp(app_id).app_name);
    } else {
      dbAppIds.push(app_id);
    }
  }
  if (dbAppIds.length > 0) {
    const appRows = await db
      .selectFrom("apps")
      .where("app_id", "in", dbAppIds)
      .select(["app_id", "app_name"])
      .execute();
    for (const row of appRows) {
      nameById.set(row.app_id, row.app_name);
    }
  }
  return nameById;
}

export default resolveAppNames;
