// 00015-authorization-codes-add-expiry-and-used-at.ts
//
// Adds single-use and server-side expiry enforcement to OAuth2 PKCE
// authorization codes (RFC 6749 §4.1.2):
//   - `used_at` (nullable): timestamp when the code was consumed by a
//     successful token exchange. NULL means unused.
//   - `expires_at` (NOT NULL): timestamp after which the code is invalid.
//
// Existing rows are backfilled with `expires_at = created_at + 600000`
// (10 minutes, matching MAX_AUTHORIZATION_CODE_AGE). Rows older than that
// window are effectively already expired on migration (correct); rows
// within the window keep their natural remaining lifetime, which
// preserves in-flight OAuth flows across deploys.

import type { Kysely } from "@schemavaults/dbh";
import { sql } from "@/sql";

export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    ALTER TABLE AUTHORIZATION_CODES
    ADD COLUMN IF NOT EXISTS used_at BIGINT;
  `.execute(db);

  await sql`
    ALTER TABLE AUTHORIZATION_CODES
    ADD COLUMN IF NOT EXISTS expires_at BIGINT;
  `.execute(db);

  // Backfill expires_at for rows that existed before this migration.
  // 600000 ms = 10 minutes = MAX_AUTHORIZATION_CODE_AGE
  await sql`
    UPDATE AUTHORIZATION_CODES
    SET expires_at = created_at + 600000
    WHERE expires_at IS NULL;
  `.execute(db);

  await sql`
    ALTER TABLE AUTHORIZATION_CODES
    ALTER COLUMN expires_at SET NOT NULL;
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`
    ALTER TABLE AUTHORIZATION_CODES
    DROP COLUMN IF EXISTS expires_at;
  `.execute(db);

  await sql`
    ALTER TABLE AUTHORIZATION_CODES
    DROP COLUMN IF EXISTS used_at;
  `.execute(db);
}
