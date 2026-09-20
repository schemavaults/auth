// 00038-user-service-accounts.ts
//
// Service accounts for the OAuth2 client_credentials grant (RFC 6749 §4.4).
// A confidential client application (one with a registered client secret)
// may exchange its client credentials for machine-to-machine access
// tokens. Those tokens need a subject: the app's SERVICE ACCOUNT — a USERS
// row that represents the application itself rather than a person, so
// every existing token/authorization/audit path (issued-token tracking,
// revocation watermarks, app-to-API audience checks, introspection,
// userinfo) works unchanged for M2M tokens.
//
// USERS gains `service_account_app_id`: NULL for every human account, the
// owning app's id for a service account. At most one service account per
// app (partial unique index), and it goes with the app (ON DELETE CASCADE)
// so deleting an app cleans up its machine identity and, through the
// existing USERS cascades, its issued-token records.
//
// Service accounts have no PASSWORDS row (they can never sign in
// interactively) and a synthetic, undeliverable email under the reserved
// `.invalid` TLD (RFC 2606).

import type { Kysely } from "@schemavaults/dbh";
import { sql } from "@/sql";

export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    ALTER TABLE USERS
      ADD COLUMN IF NOT EXISTS service_account_app_id TEXT;
  `.execute(db);

  await sql`
    ALTER TABLE USERS
      DROP CONSTRAINT IF EXISTS fk_users_service_account_app;
  `.execute(db);
  await sql`
    ALTER TABLE USERS
      ADD CONSTRAINT fk_users_service_account_app
      FOREIGN KEY (service_account_app_id) REFERENCES APPS(app_id) ON DELETE CASCADE;
  `.execute(db);

  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS users_service_account_app_id_unique
      ON USERS (service_account_app_id)
      WHERE service_account_app_id IS NOT NULL;
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  // Service accounts have no representation without the column (they
  // would look like password-less human accounts), so remove them.
  await sql`
    DELETE FROM USERS WHERE service_account_app_id IS NOT NULL;
  `.execute(db);
  await sql`DROP INDEX IF EXISTS users_service_account_app_id_unique;`.execute(db);
  await sql`
    ALTER TABLE USERS
      DROP CONSTRAINT IF EXISTS fk_users_service_account_app;
  `.execute(db);
  await sql`
    ALTER TABLE USERS
      DROP COLUMN IF EXISTS service_account_app_id;
  `.execute(db);
}
