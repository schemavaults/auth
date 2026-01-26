// 00005-baseline-jwt-keys-table.ts

import type { Kysely } from "@schemavaults/dbh";
import { sql } from "@/sql";

async function createJwtKeysTable(
  dbh: Kysely<any>,
): Promise<void> {
  const createJwtKeysTableSql = sql`
    CREATE TABLE IF NOT EXISTS JWT_KEYS (
      audience_id TEXT NOT NULL,
      keyset_id UUID NOT NULL,
      keyset_expiry BIGINT NOT NULL,
      value TEXT NOT NULL,
      format VARCHAR(16) NOT NULL,
      privacy_level VARCHAR(16) NOT NULL,
      key_type VARCHAR(16) NOT NULL,
      PRIMARY KEY (audience_id, keyset_id, key_type)
    );
  `;

  await createJwtKeysTableSql.execute(dbh);
}

export async function up(db: Kysely<any>): Promise<void> {
  await createJwtKeysTable(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('jwt_keys').execute()
}
