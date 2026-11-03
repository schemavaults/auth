// 00052-api-server-delegated-tokens.ts
//
// API_SERVERS gains accept_delegated_tokens BOOLEAN NOT NULL DEFAULT false:
// whether the API server accepts DELEGATED access tokens, whose RFC 8693
// actor (`act`) claim names someone acting on behalf of the token's user
// (e.g. a client app's agent).
//
// - false (every existing row): the auth server never mints a token with an
//   `act` claim for the API server. Resource servers on
//   @schemavaults/auth-server-sdk < 0.39.0 (@schemavaults/jwt < 0.16.0)
//   decode token payloads strictly and reject any token carrying `act`, so
//   this is the only safe default.
// - true: the API server's managers declared that its resource server
//   accepts delegated tokens (`PUT /api/apis/{api_server_id}/delegated-token-policy`).

import type { Kysely } from "@schemavaults/dbh";
import { sql } from "@/sql";

export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    ALTER TABLE API_SERVERS
      ADD COLUMN IF NOT EXISTS accept_delegated_tokens BOOLEAN NOT NULL DEFAULT false;
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`
    ALTER TABLE API_SERVERS
      DROP COLUMN IF EXISTS accept_delegated_tokens;
  `.execute(db);
}
