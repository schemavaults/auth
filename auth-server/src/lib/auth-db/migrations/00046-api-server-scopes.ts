// 00046-api-server-scopes.ts
//
// API scopes (per-API-server OAuth 2.0 scope values, e.g. `notes:read`):
//
// - API_SERVER_SCOPES lists the scopes each API server defines, with the
//   description a consent screen shows. A scope value is unique per API
//   server and can never be an OpenID Connect scope name (enforced by the
//   management API). Rows go with their API server (ON DELETE CASCADE).
// - AUTHORIZATION_CODES gains scope_api_server_id TEXT NULL: the API server
//   whose API scopes the code's `scope` carries (the one the authorization
//   request's RFC 8707 `resource` resolved to). NULL on every existing row
//   and on every code whose grant holds no API scopes, which redeem exactly
//   as before.

import type { Kysely } from "@schemavaults/dbh";
import { sql } from "@/sql";

export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS API_SERVER_SCOPES (
      api_server_scope_id UUID PRIMARY KEY,
      api_server_id TEXT NOT NULL,
      scope TEXT NOT NULL,
      description TEXT NOT NULL,
      created_at BIGINT NOT NULL,
      created_by UUID,
      CONSTRAINT fk_api_server_scope_api_server
        FOREIGN KEY (api_server_id) REFERENCES API_SERVERS(api_server_id) ON DELETE CASCADE,
      CONSTRAINT fk_api_server_scope_created_by
        FOREIGN KEY (created_by) REFERENCES USERS(uid) ON DELETE SET NULL,
      CONSTRAINT uq_api_server_scope UNIQUE (api_server_id, scope)
    );
  `.execute(db);

  await sql`
    ALTER TABLE AUTHORIZATION_CODES
      ADD COLUMN IF NOT EXISTS scope_api_server_id TEXT;
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`
    ALTER TABLE AUTHORIZATION_CODES
      DROP COLUMN IF EXISTS scope_api_server_id;
  `.execute(db);
  await sql`DROP TABLE IF EXISTS API_SERVER_SCOPES;`.execute(db);
}
