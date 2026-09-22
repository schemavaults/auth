import "server-only";
import { type SchemaVaultsApp, schemaVaultsAppDefinitionSchema } from "@schemavaults/app-definitions";
import { ownershipFieldsFromDatabaseRow } from "@/lib/ownership/ownership-columns";

/**
 * APPS columns declared BIGINT in Postgres. The database driver returns
 * BIGINT values as strings (they may exceed the JS safe-integer range in
 * general), so they are converted before the row is parsed against the
 * definition schema, which expects numbers.
 */
const BIGINT_COLUMNS = ["created_at", "client_id_issued_at"] as const;

function coerceBigintColumn(
  column: string,
  value: unknown,
): number | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  const parsed: number =
    typeof value === "string" ? parseInt(value, 10) : Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Failed to parse '${column}' from database`);
  }
  return parsed;
}

/**
 * @description Converts the BIGINT columns of an APPS row from the string
 * form the driver delivers into numbers. Absent columns stay absent (the
 * hardcoded definitions mixed into list results never had them) and NULLs
 * stay NULL.
 */
export function normalizeAppDatabaseRow<T extends object>(
  row: T,
): Omit<T, "created_at" | "client_id_issued_at"> & {
  created_at: number;
  client_id_issued_at?: number | null;
} {
  if (!Object.hasOwn(row, "created_at") || !("created_at" in row)) {
    throw new Error("Missing app creation timestamp");
  }
  const normalized: Record<string, unknown> = { ...row };
  for (const column of BIGINT_COLUMNS) {
    if (column in normalized) {
      normalized[column] = coerceBigintColumn(column, normalized[column]);
    }
  }
  if (typeof normalized.created_at !== "number") {
    throw new Error("Failed to parse created_at from database");
  }
  return normalized as Omit<T, "created_at" | "client_id_issued_at"> & {
    created_at: number;
    client_id_issued_at?: number | null;
  };
}

/**
 * @description Parses an APPS row into the API-facing app definition.
 * Hardcoded definitions (which never come from the database, but are mixed
 * into list results) pass through the same normalisation so every returned
 * definition carries a populated `owner_type`.
 */
export default function parseAppDefinitionDatabaseRow(row: unknown): SchemaVaultsApp {
  if (typeof row !== "object" || !row)
    throw new Error("Expected row to be an object");

  const normalized = normalizeAppDatabaseRow(row);

  const parsed = schemaVaultsAppDefinitionSchema.safeParse({
    ...normalized,
    ...ownershipFieldsFromDatabaseRow(normalized),
  });

  if (!parsed.success) {
    throw new TypeError(
      "Failed to parse client app definition from database row!",
      { cause: parsed.error }
    )
  }

  return parsed.data;
} // end of parseAppDefinitionDatabaseRow()
