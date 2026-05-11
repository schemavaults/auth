// 00023-users-tokens-valid-after.ts
// Adds a per-user watermark `tokens_valid_after` (unix seconds) to USERS.
// Any refresh token whose `iat` claim is strictly less than this value is
// rejected by the refresh-token grant handler. The watermark is bumped to
// the current time on password reset so a stolen refresh token cannot
// outlive a password change.

import type { Kysely } from "@schemavaults/dbh";
import { sql } from "@/sql";

export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    ALTER TABLE USERS
      ADD COLUMN IF NOT EXISTS tokens_valid_after BIGINT NOT NULL DEFAULT 0
      CHECK (tokens_valid_after >= 0);
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`
    ALTER TABLE USERS DROP COLUMN IF EXISTS tokens_valid_after;
  `.execute(db);
}
