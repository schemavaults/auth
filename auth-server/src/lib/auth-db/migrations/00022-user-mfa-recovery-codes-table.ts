// 00021-user-mfa-recovery-codes-table.ts
// Creates the USER_MFA_RECOVERY_CODES table that stores per-user
// recovery codes (one row per code) for users with verified MFA.
//
// We never store recovery codes in plaintext. The `code_hash` column is
// an HMAC-SHA-256 of the normalized code keyed by PRIVATE_MFA_RECOVERY_PEPPER.
// HMAC is sufficient (not bcrypt/argon) because the codes themselves carry
// roughly 50 bits of entropy and we need to verify lookups in O(1) rather
// than scan/bcrypt 10 rows on every login.
//
// On regeneration the entire row set for a uid is replaced atomically inside
// a transaction. Used codes are kept (used_at IS NOT NULL) so a code cannot
// be reused even after rotation; replace-on-regenerate explicitly removes
// them along with unused codes.

import type { Kysely } from "@schemavaults/dbh";
import { sql } from "@/sql";

export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS USER_MFA_RECOVERY_CODES (
      code_id UUID PRIMARY KEY,
      uid UUID NOT NULL REFERENCES USERS(uid) ON DELETE CASCADE,
      code_hash TEXT NOT NULL,
      created_at BIGINT NOT NULL,
      used_at BIGINT
    );
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS user_mfa_recovery_codes_uid_idx
    ON USER_MFA_RECOVERY_CODES (uid);
  `.execute(db);

  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS user_mfa_recovery_codes_uid_hash_uniq
    ON USER_MFA_RECOVERY_CODES (uid, code_hash);
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("user_mfa_recovery_codes").execute();
}
