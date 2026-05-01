// 00020-issued-tokens-table.ts
// Creates the ISSUED_TOKENS table for storing one row per issued JWT
// (refresh or access). Combined with TOKEN_REVOCATIONS this lets us answer
// how many tokens a user has created (lifetime) and how many are currently
// active (issued, not yet expired, not revoked).

import type { Kysely } from "@schemavaults/dbh";
import { sql } from "@/sql";

async function createIssuedTokensTable(db: Kysely<any>) {
  await sql`
    CREATE TABLE IF NOT EXISTS ISSUED_TOKENS (
      jti UUID PRIMARY KEY,
      uid UUID NOT NULL,
      token_type TEXT NOT NULL,
      client_app_id TEXT NOT NULL,
      audience TEXT NOT NULL,
      grant_type TEXT NOT NULL,
      issued_at BIGINT NOT NULL,
      expires_at BIGINT NOT NULL,
      CONSTRAINT fk_issued_tokens_user FOREIGN KEY (uid) REFERENCES USERS(uid) ON DELETE CASCADE
    );
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS idx_issued_tokens_uid_expires_at
    ON ISSUED_TOKENS (uid, expires_at);
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS idx_issued_tokens_uid_issued_at
    ON ISSUED_TOKENS (uid, issued_at DESC);
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS idx_issued_tokens_expires_at
    ON ISSUED_TOKENS (expires_at);
  `.execute(db);
}

export async function up(db: Kysely<any>): Promise<void> {
  await createIssuedTokensTable(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("issued_tokens").execute();
}
