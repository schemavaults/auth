// 00025-webauthn-credentials.ts
// Adds WebAuthn / passkey support as a second MFA factor type alongside TOTP.
//
// Three changes to the existing USER_MFA_FACTORS table:
//   1. secret_ciphertext / kek_version become nullable — passkeys have no
//      symmetric secret; their public-key credential material lives in the
//      new USER_WEBAUTHN_CREDENTIALS table instead. Existing TOTP rows keep
//      their values.
//   2. The factor_type CHECK is widened to allow 'webauthn'.
//   3. The "one verified factor per user" partial unique index is replaced
//      with a TOTP-only one. A user may now hold at most one verified TOTP
//      factor but any number of verified passkeys.
//
// Plus a new USER_WEBAUTHN_CREDENTIALS table (1:1 with a 'webauthn' factor
// row, FK ON DELETE CASCADE so removing the factor removes the credential).
// credential_id / public_key are stored base64url-encoded; counter is the
// WebAuthn signature counter for cloned-authenticator detection.

import type { Kysely } from "@schemavaults/dbh";
import { sql } from "@/sql";

export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    ALTER TABLE USER_MFA_FACTORS
    ALTER COLUMN secret_ciphertext DROP NOT NULL;
  `.execute(db);

  await sql`
    ALTER TABLE USER_MFA_FACTORS
    ALTER COLUMN kek_version DROP NOT NULL;
  `.execute(db);

  await sql`
    ALTER TABLE USER_MFA_FACTORS
    DROP CONSTRAINT IF EXISTS user_mfa_factors_factor_type_check;
  `.execute(db);

  await sql`
    ALTER TABLE USER_MFA_FACTORS
    ADD CONSTRAINT user_mfa_factors_factor_type_check
    CHECK (factor_type IN ('totp', 'webauthn'));
  `.execute(db);

  // Replace the global single-verified-factor index with a TOTP-only one so
  // passkeys can coexist with TOTP and with each other.
  await sql`
    DROP INDEX IF EXISTS user_mfa_factors_one_verified_per_user;
  `.execute(db);

  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS user_mfa_factors_one_verified_totp_per_user
    ON USER_MFA_FACTORS (uid)
    WHERE verified = TRUE AND factor_type = 'totp';
  `.execute(db);

  await sql`
    CREATE TABLE IF NOT EXISTS USER_WEBAUTHN_CREDENTIALS (
      factor_id UUID PRIMARY KEY REFERENCES USER_MFA_FACTORS(factor_id) ON DELETE CASCADE,
      uid UUID NOT NULL REFERENCES USERS(uid) ON DELETE CASCADE,
      credential_id TEXT NOT NULL UNIQUE,
      public_key TEXT NOT NULL,
      counter BIGINT NOT NULL DEFAULT 0,
      transports TEXT,
      aaguid TEXT,
      device_type TEXT,
      backed_up BOOLEAN,
      label TEXT,
      created_at BIGINT NOT NULL
    );
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS user_webauthn_credentials_uid_idx
    ON USER_WEBAUTHN_CREDENTIALS (uid);
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("user_webauthn_credentials").ifExists().execute();

  // Restore the TOTP-only verified index back to the global one. Safe only
  // if no user holds multiple verified factors (true before this migration).
  await sql`
    DROP INDEX IF EXISTS user_mfa_factors_one_verified_totp_per_user;
  `.execute(db);

  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS user_mfa_factors_one_verified_per_user
    ON USER_MFA_FACTORS (uid)
    WHERE verified = TRUE;
  `.execute(db);

  await sql`
    ALTER TABLE USER_MFA_FACTORS
    DROP CONSTRAINT IF EXISTS user_mfa_factors_factor_type_check;
  `.execute(db);

  await sql`
    ALTER TABLE USER_MFA_FACTORS
    ADD CONSTRAINT user_mfa_factors_factor_type_check
    CHECK (factor_type IN ('totp'));
  `.execute(db);

  // Restore NOT NULL. Any passkey rows (with null secret_ciphertext) must be
  // gone first — they are, since dropping the credentials table above leaves
  // orphan factor rows; clear them defensively.
  await sql`
    DELETE FROM USER_MFA_FACTORS WHERE factor_type = 'webauthn';
  `.execute(db);

  await sql`
    ALTER TABLE USER_MFA_FACTORS
    ALTER COLUMN secret_ciphertext SET NOT NULL;
  `.execute(db);

  await sql`
    ALTER TABLE USER_MFA_FACTORS
    ALTER COLUMN kek_version SET NOT NULL;
  `.execute(db);
}
