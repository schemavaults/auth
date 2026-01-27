// 00007-baseline-server-settings-table.ts
// Creates the server_settings table for dynamic server configuration

import type { Kysely } from "@schemavaults/dbh";
import { sql } from "@/sql";

async function createServerSettingsTable(db: Kysely<any>): Promise<void> {
  const createServerSettingsTableSql = sql`
    CREATE TABLE IF NOT EXISTS SERVER_SETTINGS (
      setting_key TEXT PRIMARY KEY,
      setting_value TEXT NOT NULL,
      value_type VARCHAR(16) NOT NULL CHECK (value_type IN ('string', 'number', 'boolean', 'json')),
      description TEXT,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL,
      updated_by UUID,
      CONSTRAINT fk_updated_by FOREIGN KEY (updated_by) REFERENCES USERS(uid) ON DELETE SET NULL
    );
  `;

  await createServerSettingsTableSql.execute(db);
}

async function createServerSettingsUpdatedAtIndex(db: Kysely<any>): Promise<void> {
  const createIndexSql = sql`
    CREATE INDEX IF NOT EXISTS idx_server_settings_updated_at
    ON SERVER_SETTINGS (updated_at DESC);
  `;

  await createIndexSql.execute(db);
}

export async function up(db: Kysely<any>): Promise<void> {
  await createServerSettingsTable(db);
  await createServerSettingsUpdatedAtIndex(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("server_settings").execute();
}
