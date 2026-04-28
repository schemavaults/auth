// 00020-user-mfa-factors-table.ts
// Creates the USER_MFA_FACTORS table holding multi-factor authentication
// secrets for users who have opted into MFA. v1 supports only TOTP factors
// (RFC 6238); the `factor_type` enum is intentionally extensible so
// WebAuthn / passkey rows can be added later without a migration.
//
// Each row stores the factor's secret as AES-256-GCM ciphertext encrypted
// under a Key Encryption Key referenced by `kek_version`. The plaintext
// secret never touches the database. A partial unique index enforces at
// most one *verified* factor per user in v1; unverified rows (created
// during enrollment but never confirmed) are allowed to accumulate and
// are swept on the next enrollment attempt.
//
// `verified` flips to TRUE only after the user proves possession of the
// authenticator by submitting a valid TOTP code at /verify-enrollment.
// Until then the factor is invisible to the login flow.

import type { Kysely } from "@schemavaults/dbh";
import { sql } from "@/sql";

export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS USER_MFA_FACTORS (
      factor_id UUID PRIMARY KEY,
      uid UUID NOT NULL REFERENCES USERS(uid) ON DELETE CASCADE,
      factor_type TEXT NOT NULL CHECK (factor_type IN ('totp')),
      secret_ciphertext TEXT NOT NULL,
      kek_version INTEGER NOT NULL,
      verified BOOLEAN NOT NULL DEFAULT FALSE,
      created_at BIGINT NOT NULL,
      verified_at BIGINT,
      last_used_at BIGINT
    );
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS user_mfa_factors_uid_idx
    ON USER_MFA_FACTORS (uid);
  `.execute(db);

  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS user_mfa_factors_one_verified_per_user
    ON USER_MFA_FACTORS (uid)
    WHERE verified = TRUE;
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("user_mfa_factors").execute();
}
