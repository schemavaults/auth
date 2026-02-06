import "server-only";
import type { Kysely, Transaction } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import { type AppId, appIdSchema, getHardcodedApp, isHardcodedAppId, type SchemaVaultsApp, schemaVaultsAppDefinitionSchema } from "@schemavaults/app-definitions";

export async function getApp(
  db: Kysely<AuthDatabase> | Transaction<AuthDatabase>,
  app_id: AppId,
  debug: boolean = false
): Promise<SchemaVaultsApp | null> {
  if (!(await appIdSchema.safeParseAsync(app_id)).success) {
    throw new TypeError("Bad app ID to attempt to load application definition for!")
  }

  if (debug) {
    console.log(
      `[SchemaVaultsAppRegistry] Attempting to load app with ID: "${app_id}"`,
    );
  }

  if (isHardcodedAppId(app_id)) {
    if (debug) {
      console.log(
        `[SchemaVaultsAppRegistry] App ID '${app_id}' exists in hardcoded apps map`,
      );
    }
    const hardcoded_app: SchemaVaultsApp = getHardcodedApp(app_id);
    if (hardcoded_app) {
      if (debug) {
        console.log(
          `[SchemaVaultsAppRegistry] Found hardcoded app with ID "${hardcoded_app.app_id}":`,
          hardcoded_app,
        );
      }
      return hardcoded_app;
    } else {
      throw new Error(
        "[SchemaVaultsAppRegistry] Value is falsy from hardcoded apps map",
      );
    }
  } else {
    if (debug) {
      console.log(
        "[SchemaVaultsAppRegistry] " +
          `App_id "${app_id}" was not found in hardcoded apps list, looking up in database...`,
      );
    }
  }

  let rows: object[];
  try {
    const query = db
      .selectFrom("apps")
      .where("app_id", "=", app_id)
      .limit(1)
      .selectAll();
    if (debug) {
      console.log(
        "[SchemaVaultsAppRegistry] " +
          `Executing query for app with app_id: "${app_id}"`,
      );
    }
    const result: object[] = await query.execute();
    if (debug) {
      console.log("[SchemaVaultsAppRegistry] getApp query result: ", result);
    }
    rows = result;
  } catch (e: unknown) {
    console.error("Failed to execute query for app in apps table: ", e);
    throw new Error("Error querying apps table of database");
  }
  if (rows.length === 0) {
    if (debug) {
      console.error("Requested app not found in apps table");
    }
    return null;
  } else if (rows.length > 1) {
    throw new Error("Multiple apps found with the same app_id");
  }
  console.assert(
    rows.length === 1,
    "Expected exactly one app record to have been retrieved from the database if this point was reached!",
  );

  const first_row = rows[0]!;
  if (!Object.hasOwn(first_row, "created_at")) {
    throw new Error("App row missing creation timestamp");
  }

  const createdAt: number = parseInt(
    (first_row as { created_at: string }).created_at,
  );
  if (isNaN(createdAt)) {
    throw new Error("Failed to parse created_at from database");
  }

  const parsed_app = await schemaVaultsAppDefinitionSchema.safeParseAsync({
    ...first_row,
    created_at: createdAt,
    hardcoded: false,
  });
  if (!parsed_app.success) {
    console.error(parsed_app.error.errors);
    if (debug) {
      console.error("Row that could not be parsed: ", first_row);
    }
    throw new Error("Failed to parse app definition from database");
  }
  return parsed_app.data;
}

export default getApp;
