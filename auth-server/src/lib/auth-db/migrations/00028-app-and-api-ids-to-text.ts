// 00028-app-and-api-ids-to-text.ts
//
// Non-hardcoded app and API server IDs may now be human-readable slugs
// (anything satisfying appIdSchema/apiServerIdSchema), not just UUIDs, so
// the UUID-typed id columns must become TEXT. Postgres rejects a slug
// literal compared against a UUID column before the query even runs
// ("invalid input syntax for type uuid"), which broke every lookup
// involving a slug id.
//
// Both sides of each foreign key into apps(app_id) / api_servers
// (api_server_id) must change type together, and Postgres has no
// text = uuid equality operator, so the constraints are dropped up front
// and re-added after all the column types have been altered.

import type { Kysely } from "@schemavaults/dbh";
import { sql } from "@/sql";

async function dropForeignKeys(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE app_domains DROP CONSTRAINT IF EXISTS fk_app;`.execute(db);
  await sql`ALTER TABLE authorized_apps DROP CONSTRAINT IF EXISTS fk_app;`.execute(db);
  await sql`ALTER TABLE apps_to_apis_permissions DROP CONSTRAINT IF EXISTS fk_app;`.execute(db);
  await sql`ALTER TABLE apps_to_apis_permissions DROP CONSTRAINT IF EXISTS fk_api;`.execute(db);
  await sql`ALTER TABLE apps_to_hardcoded_apis_permissions DROP CONSTRAINT IF EXISTS fk_hardcoded_perm_app;`.execute(db);
  await sql`ALTER TABLE api_server_domains DROP CONSTRAINT IF EXISTS fk_api;`.execute(db);
  await sql`ALTER TABLE jwks_access_keys DROP CONSTRAINT IF EXISTS fk_api_server;`.execute(db);
}

async function addForeignKeys(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE app_domains ADD CONSTRAINT fk_app FOREIGN KEY (app_id) REFERENCES apps(app_id) ON DELETE CASCADE;`.execute(db);
  await sql`ALTER TABLE authorized_apps ADD CONSTRAINT fk_app FOREIGN KEY (app_id) REFERENCES apps(app_id) ON DELETE CASCADE;`.execute(db);
  await sql`ALTER TABLE apps_to_apis_permissions ADD CONSTRAINT fk_app FOREIGN KEY (client_app_id) REFERENCES apps(app_id) ON DELETE CASCADE;`.execute(db);
  await sql`ALTER TABLE apps_to_apis_permissions ADD CONSTRAINT fk_api FOREIGN KEY (api_server_id) REFERENCES api_servers(api_server_id) ON DELETE CASCADE;`.execute(db);
  await sql`ALTER TABLE apps_to_hardcoded_apis_permissions ADD CONSTRAINT fk_hardcoded_perm_app FOREIGN KEY (client_app_id) REFERENCES apps(app_id) ON DELETE CASCADE;`.execute(db);
  await sql`ALTER TABLE api_server_domains ADD CONSTRAINT fk_api FOREIGN KEY (api_server_id) REFERENCES api_servers(api_server_id) ON DELETE CASCADE;`.execute(db);
  await sql`ALTER TABLE jwks_access_keys ADD CONSTRAINT fk_api_server FOREIGN KEY (api_server_id) REFERENCES api_servers(api_server_id) ON DELETE CASCADE;`.execute(db);
}

export async function up(db: Kysely<any>): Promise<void> {
  await dropForeignKeys(db);

  await sql`ALTER TABLE apps ALTER COLUMN app_id TYPE TEXT USING app_id::text;`.execute(db);
  await sql`ALTER TABLE app_domains ALTER COLUMN app_id TYPE TEXT USING app_id::text;`.execute(db);
  await sql`ALTER TABLE authorized_apps ALTER COLUMN app_id TYPE TEXT USING app_id::text;`.execute(db);
  await sql`ALTER TABLE apps_to_apis_permissions ALTER COLUMN client_app_id TYPE TEXT USING client_app_id::text;`.execute(db);
  await sql`ALTER TABLE apps_to_apis_permissions ALTER COLUMN api_server_id TYPE TEXT USING api_server_id::text;`.execute(db);
  await sql`ALTER TABLE apps_to_hardcoded_apis_permissions ALTER COLUMN client_app_id TYPE TEXT USING client_app_id::text;`.execute(db);
  await sql`ALTER TABLE api_servers ALTER COLUMN api_server_id TYPE TEXT USING api_server_id::text;`.execute(db);
  await sql`ALTER TABLE api_server_domains ALTER COLUMN api_server_id TYPE TEXT USING api_server_id::text;`.execute(db);
  await sql`ALTER TABLE jwks_access_keys ALTER COLUMN api_server_id TYPE TEXT USING api_server_id::text;`.execute(db);

  await addForeignKeys(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  // The casts below fail if any non-UUID (slug) ids were created while the
  // columns were TEXT.
  await dropForeignKeys(db);

  await sql`ALTER TABLE apps ALTER COLUMN app_id TYPE UUID USING app_id::uuid;`.execute(db);
  await sql`ALTER TABLE app_domains ALTER COLUMN app_id TYPE UUID USING app_id::uuid;`.execute(db);
  await sql`ALTER TABLE authorized_apps ALTER COLUMN app_id TYPE UUID USING app_id::uuid;`.execute(db);
  await sql`ALTER TABLE apps_to_apis_permissions ALTER COLUMN client_app_id TYPE UUID USING client_app_id::uuid;`.execute(db);
  await sql`ALTER TABLE apps_to_apis_permissions ALTER COLUMN api_server_id TYPE UUID USING api_server_id::uuid;`.execute(db);
  await sql`ALTER TABLE apps_to_hardcoded_apis_permissions ALTER COLUMN client_app_id TYPE UUID USING client_app_id::uuid;`.execute(db);
  await sql`ALTER TABLE api_servers ALTER COLUMN api_server_id TYPE UUID USING api_server_id::uuid;`.execute(db);
  await sql`ALTER TABLE api_server_domains ALTER COLUMN api_server_id TYPE UUID USING api_server_id::uuid;`.execute(db);
  await sql`ALTER TABLE jwks_access_keys ALTER COLUMN api_server_id TYPE UUID USING api_server_id::uuid;`.execute(db);

  await addForeignKeys(db);
}
