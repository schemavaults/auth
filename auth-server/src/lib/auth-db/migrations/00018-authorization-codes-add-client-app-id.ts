// 00018-authorization-codes-add-client-app-id.ts
//
// Binds OAuth2 PKCE authorization codes to the specific client application
// they were issued for (defense-in-depth). Previously, a code was
// single-use only by its random value: an attacker who obtained an
// authorization code issued for App A could attempt to redeem it at the
// token endpoint for App B by changing the `client_app_id`. This column
// lets the consumer reject any mismatch.
//
// Existing rows are deleted rather than backfilled: authorization codes
// are ≤10 minutes ephemeral (see MAX_AUTHORIZATION_CODE_AGE / migration
// 00015) and cannot be associated with an app retroactively. Any
// in-flight OAuth flow will simply need to be restarted.

import type { Kysely } from "@schemavaults/dbh";
import { sql } from "@/sql";

export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    ALTER TABLE AUTHORIZATION_CODES
    ADD COLUMN IF NOT EXISTS client_app_id TEXT;
  `.execute(db);

  // Existing rows cannot be associated with an app retroactively; drop
  // them before applying the NOT NULL constraint. They would have
  // expired within 10 minutes anyway.
  await sql`
    DELETE FROM AUTHORIZATION_CODES
    WHERE client_app_id IS NULL;
  `.execute(db);

  await sql`
    ALTER TABLE AUTHORIZATION_CODES
    ALTER COLUMN client_app_id SET NOT NULL;
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS authorization_codes_client_app_id_idx
    ON AUTHORIZATION_CODES (client_app_id);
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`
    DROP INDEX IF EXISTS authorization_codes_client_app_id_idx;
  `.execute(db);

  await sql`
    ALTER TABLE AUTHORIZATION_CODES
    DROP COLUMN IF EXISTS client_app_id;
  `.execute(db);
}
