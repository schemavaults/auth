// 00027-app-and-api-ids-to-text.ts
//
// Non-hardcoded app and API server IDs may now be human-readable slugs
// (anything satisfying appIdSchema/apiServerIdSchema), not just UUIDs, so the
// UUID-typed id columns must become TEXT. Postgres rejects a slug literal
// compared against a UUID column before the query even runs ("invalid input
// syntax for type uuid"), which broke every lookup involving a slug id.
//
// This migration also clears authorized_hardcoded_apps: it only ever held
// grants for hardcoded apps other than the auth server itself (which is
// always implicitly authorized), and no such apps exist anymore. Rows for
// formerly-hardcoded apps (e.g. "schemavaults-web") no longer resolve to any
// app definition and crashed the /account authorized-apps listing.

import type { Kysely } from "@schemavaults/dbh";
import { sql } from "@/sql";

// Foreign keys into apps(app_id) / api_servers(api_server_id). Both sides of
// each FK must change type together, and Postgres has no text = uuid equality
// operator, so the constraints are dropped up front and re-added after all
// the column types have been altered.
const FOREIGN_KEYS = [
  {
    table: "app_domains",
    constraint: "fk_app",
    column: "app_id",
    references: "apps(app_id)",
  },
  {
    table: "authorized_apps",
    constraint: "fk_app",
    column: "app_id",
    references: "apps(app_id)",
  },
  {
    table: "apps_to_apis_permissions",
    constraint: "fk_app",
    column: "client_app_id",
    references: "apps(app_id)",
  },
  {
    table: "apps_to_apis_permissions",
    constraint: "fk_api",
    column: "api_server_id",
    references: "api_servers(api_server_id)",
  },
  {
    table: "apps_to_hardcoded_apis_permissions",
    constraint: "fk_hardcoded_perm_app",
    column: "client_app_id",
    references: "apps(app_id)",
  },
  {
    table: "api_server_domains",
    constraint: "fk_api",
    column: "api_server_id",
    references: "api_servers(api_server_id)",
  },
  {
    table: "jwks_access_keys",
    constraint: "fk_api_server",
    column: "api_server_id",
    references: "api_servers(api_server_id)",
  },
] as const;

const ID_COLUMNS = [
  { table: "apps", column: "app_id" },
  { table: "app_domains", column: "app_id" },
  { table: "authorized_apps", column: "app_id" },
  { table: "apps_to_apis_permissions", column: "client_app_id" },
  { table: "apps_to_apis_permissions", column: "api_server_id" },
  { table: "apps_to_hardcoded_apis_permissions", column: "client_app_id" },
  { table: "api_servers", column: "api_server_id" },
  { table: "api_server_domains", column: "api_server_id" },
  { table: "jwks_access_keys", column: "api_server_id" },
] as const;

async function dropForeignKeys(db: Kysely<any>): Promise<void> {
  for (const fk of FOREIGN_KEYS) {
    await sql
      .raw(
        `ALTER TABLE ${fk.table} DROP CONSTRAINT IF EXISTS ${fk.constraint};`,
      )
      .execute(db);
  }
}

async function addForeignKeys(db: Kysely<any>): Promise<void> {
  for (const fk of FOREIGN_KEYS) {
    await sql
      .raw(
        `ALTER TABLE ${fk.table} ADD CONSTRAINT ${fk.constraint} ` +
          `FOREIGN KEY (${fk.column}) REFERENCES ${fk.references} ON DELETE CASCADE;`,
      )
      .execute(db);
  }
}

export async function up(db: Kysely<any>): Promise<void> {
  await sql`DELETE FROM authorized_hardcoded_apps;`.execute(db);

  await dropForeignKeys(db);

  for (const { table, column } of ID_COLUMNS) {
    await sql
      .raw(
        `ALTER TABLE ${table} ALTER COLUMN ${column} TYPE TEXT USING ${column}::text;`,
      )
      .execute(db);
  }

  await addForeignKeys(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  // Lossy: rows deleted from authorized_hardcoded_apps are not restored, and
  // the casts below fail if any non-UUID (slug) ids were created while the
  // columns were TEXT.
  await dropForeignKeys(db);

  for (const { table, column } of ID_COLUMNS) {
    await sql
      .raw(
        `ALTER TABLE ${table} ALTER COLUMN ${column} TYPE UUID USING ${column}::uuid;`,
      )
      .execute(db);
  }

  await addForeignKeys(db);
}
