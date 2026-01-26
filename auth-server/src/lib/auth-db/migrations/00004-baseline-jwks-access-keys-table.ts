// 00004-baseline-jwks-access-keys-table.ts

import type { Kysely } from "@schemavaults/dbh";
import { sql } from "@/sql";

async function setupJwksAccessKeysSQLTable(
  db: Kysely<any>,
): Promise<void> {
  const createJwksAccessKeysTable = sql`
    CREATE TABLE IF NOT EXISTS JWKS_ACCESS_KEYS (
      key_id UUID PRIMARY KEY,
      api_server_id UUID NOT NULL,
      public_key TEXT NOT NULL,
      key_algorithm VARCHAR(16) NOT NULL DEFAULT 'RS256',
      created_at BIGINT NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      CONSTRAINT fk_api_server
        FOREIGN KEY (api_server_id)
        REFERENCES API_SERVERS(api_server_id)
        ON DELETE CASCADE
    );
  `;
  await createJwksAccessKeysTable.execute(db);

  const createIndex = sql`
    CREATE INDEX IF NOT EXISTS idx_jwks_access_keys_api_server
      ON JWKS_ACCESS_KEYS(api_server_id) WHERE is_active = TRUE;
  `;
  await createIndex.execute(db);

  const createJwksAccessKeysForHardcodedTable = sql`
    CREATE TABLE IF NOT EXISTS JWKS_ACCESS_KEYS_FOR_HARDCODED (
      key_id UUID PRIMARY KEY,
      api_server_id TEXT NOT NULL,
      public_key TEXT NOT NULL,
      key_algorithm VARCHAR(16) NOT NULL DEFAULT 'RS256',
      created_at BIGINT NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT TRUE
    );
  `;
  await createJwksAccessKeysForHardcodedTable.execute(db);

  const createIndexForHardcoded = sql`
    CREATE INDEX IF NOT EXISTS idx_jwks_access_keys_for_hardcoded_api_server
      ON JWKS_ACCESS_KEYS_FOR_HARDCODED(api_server_id) WHERE is_active = TRUE;
  `;
  await createIndexForHardcoded.execute(db);
}

export async function up(db: Kysely<any>): Promise<void> {
  await setupJwksAccessKeysSQLTable(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await Promise.all([
    db.schema.dropIndex('idx_jwks_access_keys_for_hardcoded_api_server').execute(),
    db.schema.dropIndex('idx_jwks_access_keys_api_server').execute()
  ])
  await Promise.all([
    db.schema.dropTable('jwks_access_keys_for_hardcoded').execute(),
    db.schema.dropTable('jwks_access_keys').execute(),
  ])
}
