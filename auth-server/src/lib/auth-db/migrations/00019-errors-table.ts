// 00019-errors-table.ts
// Creates the ERRORS table for storing server-side exceptions captured via
// the captureServerException() helper. Each row represents one caught
// exception along with optional operation/route/user context so admins can
// browse and triage failures from the /admin/errors page.
//
// The uid column is intentionally NOT a foreign key: we do not want error
// capture to fail if the associated user is deleted, and ON DELETE CASCADE
// would wipe forensic data we may still need. Retention is out of scope for
// this migration.

import type { Kysely } from "@schemavaults/dbh";
import { sql } from "@/sql";

export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS ERRORS (
      error_id UUID PRIMARY KEY,
      created_at BIGINT NOT NULL,
      name TEXT NOT NULL,
      message TEXT NOT NULL,
      stack TEXT,
      op_name TEXT,
      route TEXT,
      uid UUID,
      context JSONB
    );
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS errors_created_at_idx
    ON ERRORS (created_at DESC);
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("errors").execute();
}
