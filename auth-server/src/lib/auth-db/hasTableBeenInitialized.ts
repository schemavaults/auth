import { type Kysely, sql } from "@schemavaults/dbh";
import type { AuthDatabase } from "./auth-database-types";

export default async function hasTableBeenInitialized(
  db: Kysely<AuthDatabase>,
  table_name: string,
): Promise<boolean> {
  {
    if (typeof table_name !== "string") {
      throw new TypeError("table_name must be a string");
    }

    const tableExists = sql`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = ${table_name}
      ) AS exists;
    `.execute(db);

    const { rows } = await tableExists;

    if (!Array.isArray(rows)) {
      throw new Error(
        "Unexpected result format, expected 'rows' to be an array!",
      );
    } else if (rows.length !== 1) {
      throw new Error(
        "Unexpected result format, expected 'rows' to have exactly one element!",
      );
    } else if (typeof rows[0] !== "object" || rows[0] === null) {
      throw new Error(
        "Unexpected result format, expected 'rows[0]' to be an object!",
      );
    }

    const exists: boolean = "exists" in rows[0] && !!rows[0].exists;
    return exists;
  }
}
