import "server-only";
import { type SchemaVaultsApp, schemaVaultsAppDefinitionSchema } from "@schemavaults/app-definitions";
import { ownershipFieldsFromDatabaseRow } from "@/lib/ownership/ownership-columns";

/**
 * @description Parses an APPS row into the API-facing app definition.
 * Hardcoded definitions (which never come from the database, but are mixed
 * into list results) pass through the same normalisation so every returned
 * definition carries a populated `owner_type`.
 */
export default function parseAppDefinitionDatabaseRow(row: unknown): SchemaVaultsApp {
  if (typeof row !== "object" || !row)
    throw new Error("Expected row to be an object");
  if (!Object.hasOwn(row, "created_at") || !("created_at" in row)) {
    throw new Error("Missing app creation timestamp");
  }
  const created_at: number =
    typeof row.created_at === "string"
      ? parseInt(row.created_at)
      : Number(row.created_at);
  if (isNaN(created_at)) {
    throw new Error("Failed to parse created_at from database");
  }

  const parsed = schemaVaultsAppDefinitionSchema.safeParse({
    ...row,
    created_at,
    ...ownershipFieldsFromDatabaseRow(row),
  });

  if (!parsed.success) {
    throw new TypeError(
      "Failed to parse client app definition from database row!",
      { cause: parsed.error }
    )
  }

  return parsed.data;
} // end of parseAppDefinitionDatabaseRow()
