import "server-only";
import { getHardcodedSchemaVaultsApps, type ListAppsQueryType, listAppsQueryTypeSchema, type SchemaVaultsApp, schemaVaultsAppDefinitionSchema } from "@schemavaults/app-definitions";
import type { UserData } from "@schemavaults/auth-common";
import type { Kysely, Transaction } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import parseAppDefinitionDatabaseRow from "./parse-app-definition-database-row";

export default async function listApps(
  db: Kysely<AuthDatabase> | Transaction<AuthDatabase>,
  type: Exclude<ListAppsQueryType, "authorized">,
  user: UserData,
  debug: boolean = false
): Promise<SchemaVaultsApp[]> {

  if (!user) {
    throw new Error("You must be logged in to list SchemaVaults apps");
  }
  if (type === "all" && !user.admin) {
    throw new Error("You must be an admin to list all SchemaVaults apps");
  }
  if (!(await listAppsQueryTypeSchema.safeParseAsync(type)).success) {
    throw new Error("Invalid apps query type");
  }
  if (type !== "all" && type !== "public") {
    throw new Error("Invalid apps query type for listing available apps");
  }

  if (debug) {
    console.log("[SchemaVaultsAppRegistry] Attempting to list apps...");
  }

  const MAX_PAGE_SIZE: number = 50;

  let query = db.selectFrom("apps");

  if (type === "public") {
    query = query.where("public", "=", true);
  }

  query = query.limit(MAX_PAGE_SIZE);

  const query_result: readonly SchemaVaultsApp[] = await query.selectAll().execute();

  if (!Array.isArray(query_result)) {
    throw new Error("Expected database query result to be an array of rows");
  }

  // result => transformed_output => transform => (actually) transformed_output
  const transformed_output: SchemaVaultsApp[] = [...query_result];

  // Add hardcoded apps to query result
  const hardcodedApps: readonly SchemaVaultsApp[] = getHardcodedSchemaVaultsApps();
  if (type === "all") {
    transformed_output.push(...hardcodedApps);
  } else if (type === "public") {
    const hardcodedAppsLength: number = hardcodedApps.length;
    transformed_output.push(
      ...hardcodedApps.filter((a) => a.public),
    );
    if (debug) {
      console.log(
        `[SchemaVaultsAppRegistry] Number of public apps from database: ${query_result.length}`,
      );
      console.log(
        `[SchemaVaultsAppRegistry] Number of public hardcoded apps: ${hardcodedAppsLength}`,
      );
      console.log(
        `[SchemaVaultsAppRegistry] Number of apps after adding hardcoded apps : ${hardcodedAppsLength}`,
      );
    }
  } else {
    if (debug) {
      console.log("[SchemaVaultsAppRegistry] query type", type);
    }
  }

  try {
    const parsed = await schemaVaultsAppDefinitionSchema
      .array()
      .safeParseAsync(
        transformed_output.map(
          parseAppDefinitionDatabaseRow
        ),
      ); // end parsing app definitions array
    if (!parsed.success) throw parsed.error;
    return parsed.data;
  } catch (e: unknown) {
    console.error(e);
    throw new Error("Failed to parse the apps data received from database");
  }
}
