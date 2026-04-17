// 00017-token-revocations-table.ts
// Creates the TOKEN_REVOCATIONS table for storing revoked refresh token JTIs.
// When a user logs out, their refresh token's jti is recorded here so that
// any subsequent attempt to use that token for a refresh grant is rejected.
// Rows are cleaned up after the original token's expiry via the expires_at column.

import type { Kysely } from "@schemavaults/dbh";
import { sql } from "@/sql";

async function createTokenRevocationsTable(db: Kysely<any>) {
  const createTable = sql`
    CREATE TABLE IF NOT EXISTS TOKEN_REVOCATIONS (
      jti UUID PRIMARY KEY,
      uid UUID NOT NULL,
      expires_at BIGINT NOT NULL,
      revoked_at BIGINT NOT NULL,
      CONSTRAINT fk_token_revocation_user FOREIGN KEY (uid) REFERENCES USERS(uid) ON DELETE CASCADE
    );
  `;
  await createTable.execute(db);

  const createExpiresIndex = sql`
    CREATE INDEX IF NOT EXISTS idx_token_revocations_expires_at ON TOKEN_REVOCATIONS (expires_at);
  `;
  await createExpiresIndex.execute(db);

  const createUidIndex = sql`
    CREATE INDEX IF NOT EXISTS idx_token_revocations_uid ON TOKEN_REVOCATIONS (uid);
  `;
  await createUidIndex.execute(db);
}

export async function up(db: Kysely<any>): Promise<void> {
  await createTokenRevocationsTable(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("token_revocations").execute();
}
