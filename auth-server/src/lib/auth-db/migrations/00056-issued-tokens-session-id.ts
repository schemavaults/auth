// 00056-issued-tokens-session-id.ts
//
// Gives every ISSUED token the id of the SESSION it belongs to, so ending a
// session (logout, RFC 7009 revocation of its refresh token) revokes every
// token of it, not only those of the last refresh.
//
// `refresh_jti` (migration 00039) links an access token to the refresh token
// minted in the same grant. Refresh tokens rotate: each refresh mints a new
// refresh token, so the access tokens of earlier refreshes (and the delegated
// tokens exchanged for them) were linked to refresh tokens that no longer
// exist, and outlived the session until they expired.
//
// `session_id` is the jti of the FIRST refresh token of the rotation chain
// and is carried forward by every refresh: the refresh tokens of the chain,
// the access tokens minted with them and the delegated tokens exchanged for
// those all share it. NULL for tokens that belong to no session (the
// client_credentials grant) and for rows that expired before this migration.
//
// Unexpired rows are backfilled with the best linkage recorded for them: an
// access token joins the session of the refresh token it was minted with, a
// refresh token starts its own. Chains that rotated before this migration
// stay split until their access tokens expire (at most one access-token
// lifetime); the revocation also still follows `refresh_jti`.

import type { Kysely } from "@schemavaults/dbh";
import { sql } from "@/sql";

export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    ALTER TABLE ISSUED_TOKENS
      ADD COLUMN IF NOT EXISTS session_id UUID;
  `.execute(db);

  await sql`
    UPDATE ISSUED_TOKENS
      SET session_id = CASE WHEN token_type = 'refresh' THEN jti ELSE refresh_jti END
      WHERE session_id IS NULL
        AND expires_at > ${Date.now()}
        AND (token_type = 'refresh' OR refresh_jti IS NOT NULL);
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS idx_issued_tokens_session_id
      ON ISSUED_TOKENS (session_id)
      WHERE session_id IS NOT NULL;
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`DROP INDEX IF EXISTS idx_issued_tokens_session_id;`.execute(db);
  await sql`
    ALTER TABLE ISSUED_TOKENS
      DROP COLUMN IF EXISTS session_id;
  `.execute(db);
}
