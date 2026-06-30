import "server-only";
import { type SchemaVaultsApp, schemaVaultsAppDefinitionSchema } from "@schemavaults/app-definitions";
import { SCHEMAVAULTS_ORGANIZATION_ID } from "@schemavaults/auth-common";

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

  const owner_organization_id: string | undefined = (
    "owner_organization_id" in row && typeof row['owner_organization_id'] === 'string'
  ) ? (row.owner_organization_id) : SCHEMAVAULTS_ORGANIZATION_ID

  const parsed = schemaVaultsAppDefinitionSchema.safeParse({
    ...row,
    created_at,
    owner_organization_id
  });

  if (!parsed.success) {
    throw new TypeError(
      "Failed to parse client app definition from database row!",
      { cause: parsed.data }
    )
  }

  return parsed.data;
} // end of parseAppDefinitionDatabaseRow()
