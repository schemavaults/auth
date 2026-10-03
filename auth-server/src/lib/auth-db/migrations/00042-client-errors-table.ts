// 00042-client-errors-table.ts
// Creates the CLIENT_ERRORS table for errors that client applications report
// through POST /api/client-errors/{client_app_id} (the auth client SDK sends
// them unless an app sets `disable_telemetry`). Admins browse them and their
// summary statistics on /admin/client-errors.
//
// - client_app_id is NOT a foreign key: hardcoded apps (the auth server's
//   own frontend included) have no APPS row, and deleting an app should not
//   need to wait on, or silently wipe, its error history.
// - fingerprint groups reports of the same error (see
//   lib/client-errors/fingerprint.ts); the stats queries group on it.
// - reported_uid is whatever user the client says was signed in. It is not
//   verified, so it is TEXT and not a foreign key to USERS.
// - size_bytes is the size of the row's contents, computed at insert
//   (lib/client-errors/row-size.ts); their sum is checked against the
//   client_error_reports_max_storage_mb server setting.

import type { Kysely } from "@schemavaults/dbh";
import { sql } from "@/sql";

export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS CLIENT_ERRORS (
      client_error_id UUID PRIMARY KEY,
      created_at BIGINT NOT NULL,
      occurred_at BIGINT,
      client_app_id TEXT NOT NULL,
      fingerprint TEXT NOT NULL,
      name TEXT NOT NULL,
      message TEXT NOT NULL,
      stack TEXT,
      operation TEXT,
      sdk_name TEXT,
      sdk_version TEXT,
      app_env TEXT,
      page_url TEXT,
      origin TEXT,
      user_agent TEXT,
      reported_uid TEXT,
      context JSONB,
      size_bytes INTEGER NOT NULL DEFAULT 0
    );
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS client_errors_created_at_idx
    ON CLIENT_ERRORS (created_at DESC);
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS client_errors_app_created_at_idx
    ON CLIENT_ERRORS (client_app_id, created_at DESC);
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS client_errors_fingerprint_created_at_idx
    ON CLIENT_ERRORS (fingerprint, created_at DESC);
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("client_errors").ifExists().execute();
}
