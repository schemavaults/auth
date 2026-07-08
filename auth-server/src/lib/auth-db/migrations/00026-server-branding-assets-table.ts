// 00026-server-branding-assets-table.ts
// Creates the server_branding_assets table for white-label branding images
// (favicon, app icon, opengraph image) uploaded by administrators.

import type { Kysely } from "@schemavaults/dbh";
import { sql } from "@/sql";

async function createServerBrandingAssetsTable(db: Kysely<any>): Promise<void> {
  // Image bytes are stored base64-encoded in a TEXT column (rather than BYTEA)
  // to match the TEXT-serialized storage convention of SERVER_SETTINGS and to
  // stay portable across the Neon serverless websocket proxy drivers.
  const createServerBrandingAssetsTableSql = sql`
    CREATE TABLE IF NOT EXISTS SERVER_BRANDING_ASSETS (
      asset_key TEXT PRIMARY KEY,
      content_base64 TEXT NOT NULL,
      content_type TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL,
      updated_by UUID,
      CONSTRAINT fk_branding_updated_by FOREIGN KEY (updated_by) REFERENCES USERS(uid) ON DELETE SET NULL
    );
  `;

  await createServerBrandingAssetsTableSql.execute(db);
}

async function createServerBrandingAssetsUpdatedAtIndex(
  db: Kysely<any>,
): Promise<void> {
  const createIndexSql = sql`
    CREATE INDEX IF NOT EXISTS idx_server_branding_assets_updated_at
    ON SERVER_BRANDING_ASSETS (updated_at DESC);
  `;

  await createIndexSql.execute(db);
}

export async function up(db: Kysely<any>): Promise<void> {
  await createServerBrandingAssetsTable(db);
  await createServerBrandingAssetsUpdatedAtIndex(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("server_branding_assets").execute();
}
