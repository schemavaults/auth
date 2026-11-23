import "server-only";
import {
  schemaVaultsApiServerDefinitionSchema,
  type SchemaVaultsApiServerDefinition,
} from "@schemavaults/app-definitions";
import { ownershipFieldsFromDatabaseRow } from "@/lib/ownership/ownership-columns";

/**
 * @description Parses `api_servers` rows into API server definitions
 * (`created_at` arrives as a string from the BIGINT column). Shared by the
 * list queries of this folder; not re-exported from ./index.
 */
export async function parseApiServerDefinitionsFromDbRows(rows: unknown[]): Promise<readonly SchemaVaultsApiServerDefinition[]> {
  const parsed = await schemaVaultsApiServerDefinitionSchema
    .array()
    .safeParseAsync(
      rows.map((row) => {
        if (typeof row !== "object" || !row)
          throw new Error("Expected row to be an object");
        if (!Object.hasOwn(row, "created_at")) {
          throw new Error("Missing api server creation time ('created_at')");
        }
        const created_at: number = parseInt(
          (row as { created_at: string }).created_at,
        );
        if (isNaN(created_at)) {
          throw new TypeError("Failed to parse 'created_at' from database");
        }

        return {
          ...row,
          created_at,
          hardcoded: false,
          ...ownershipFieldsFromDatabaseRow(row),
        };
      }),
    );
  if (!parsed.success) {
    throw new Error("Failed to parse API server definitions from database rows", {
      cause: parsed.error,
    });
  }
  return parsed.data;
}

export default parseApiServerDefinitionsFromDbRows;
