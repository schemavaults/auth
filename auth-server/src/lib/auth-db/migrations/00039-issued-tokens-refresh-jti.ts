// 00039-issued-tokens-refresh-jti.ts
//
// Links each ISSUED access token to the refresh token it was minted
// alongside, so that logging out a session can revoke that session's
// access tokens precisely — without touching the user's other sessions
// (other client apps, other devices) or any authorization code an OIDC
// relying party is about to redeem.
//
// `refresh_jti` is NULL for refresh-token rows themselves, for access
// tokens minted without a refresh token (e.g. the client_credentials
// grant), and for rows recorded before this migration. The logout route
// revokes every unexpired row whose refresh_jti equals the jti of the
// refresh token being logged out; the partial index keeps that lookup
// cheap.

import type { Kysely } from "@schemavaults/dbh";
import { sql } from "@/sql";

export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    ALTER TABLE ISSUED_TOKENS
      ADD COLUMN IF NOT EXISTS refresh_jti UUID;
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS idx_issued_tokens_refresh_jti
      ON ISSUED_TOKENS (refresh_jti)
      WHERE refresh_jti IS NOT NULL;
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`DROP INDEX IF EXISTS idx_issued_tokens_refresh_jti;`.execute(db);
  await sql`
    ALTER TABLE ISSUED_TOKENS
      DROP COLUMN IF EXISTS refresh_jti;
  `.execute(db);
}
