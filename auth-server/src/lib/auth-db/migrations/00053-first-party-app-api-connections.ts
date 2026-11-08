// 00053-first-party-app-api-connections.ts
//
// APP_API_SCOPE_POLICIES gains first_party BOOLEAN NOT NULL DEFAULT false:
// whether an app-to-API connection is FIRST-PARTY, i.e. the app and the API
// server belong to the same party, so a user signing in to the app for the
// API server consents implicitly: authorization requests naming the API
// server as their RFC 8707 `resource` get the API scopes they ask for (among
// those the app may be granted) without the consent screen, and the app
// authorization and scope consents are recorded when the authorization code
// is minted.
//
// - false (every existing row, and connections without a policy row): users
//   consent on the consent screen, as before.
// - true: set by a platform administrator
//   (`PUT /api/apis/{api_server_id}/connect_app/{client_app_id}/first-party`).
//
// A column on the per-connection policy table rather than on
// APPS_TO_APIS_PERMISSIONS, whose rows older code reads with SELECT * into a
// strict schema; older code reads and writes APP_API_SCOPE_POLICIES with
// explicit columns, so the default covers its inserts.

import type { Kysely } from "@schemavaults/dbh";
import { sql } from "@/sql";

export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    ALTER TABLE APP_API_SCOPE_POLICIES
      ADD COLUMN IF NOT EXISTS first_party BOOLEAN NOT NULL DEFAULT false;
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`
    ALTER TABLE APP_API_SCOPE_POLICIES
      DROP COLUMN IF EXISTS first_party;
  `.execute(db);
}
