// 00040-dynamic-client-registration.ts
//
// OAuth 2.0 Dynamic Client Registration (RFC 7591) at POST /api/oidc/register.
//
// A dynamically registered client is created anonymously, so it has no
// owner: APPS.owner_type gains a fourth value,
// 'dynamic-client-registration', stored with NULL owner_organization_id
// and NULL owner_uid. Only global admins can view, manage or delete such
// rows. The value is added to the APPS constraints only — API servers are
// never registered dynamically, so API_SERVERS keeps the three-value
// check from migration 00037.
//
// APPS also gains one column per persisted RFC 7591 metadata field
// (client_uri, logo_uri, tos_uri, policy_uri, contacts, grant_types,
// response_types, token_endpoint_auth_method, software_id,
// software_version, registered_scope, client_id_issued_at). All are NULL
// for apps created through the management console. `app_name` is a TEXT
// column, so the raised 128-character display-name limit needs no
// schema change.
//
// API_SERVERS gains the dynamic-client policy:
//   - allow_dynamic_clients BOOLEAN NOT NULL DEFAULT FALSE: whether
//     dynamically registered clients may request tokens for this API
//     server (RFC 8707 `resource`) without an explicit app-to-API
//     connection.
//   - resource_url_match_mode TEXT NOT NULL DEFAULT 'exact'
//     ('exact' | 'prefix'): how a `resource` URL is matched against the
//     server's registered domains.

import type { Kysely } from "@schemavaults/dbh";
import { sql } from "@/sql";

const APPS_METADATA_COLUMNS = [
  "client_uri TEXT",
  "logo_uri TEXT",
  "tos_uri TEXT",
  "policy_uri TEXT",
  "contacts JSONB",
  "grant_types JSONB",
  "response_types JSONB",
  "token_endpoint_auth_method TEXT",
  "software_id TEXT",
  "software_version TEXT",
  "registered_scope TEXT",
  "client_id_issued_at BIGINT",
] as const;

const APPS_METADATA_COLUMN_NAMES: readonly string[] = APPS_METADATA_COLUMNS.map(
  (definition): string => definition.split(" ")[0] ?? definition,
);

export async function up(db: Kysely<any>): Promise<void> {
  // --- APPS: owner type ---------------------------------------------------
  await sql`
    ALTER TABLE APPS
      DROP CONSTRAINT IF EXISTS chk_apps_owner_type;
  `.execute(db);
  await sql`
    ALTER TABLE APPS
      ADD CONSTRAINT chk_apps_owner_type
      CHECK (owner_type IN ('platform', 'organization', 'user', 'dynamic-client-registration'));
  `.execute(db);

  await sql`
    ALTER TABLE APPS
      DROP CONSTRAINT IF EXISTS chk_apps_owner_consistency;
  `.execute(db);
  await sql`
    ALTER TABLE APPS
      ADD CONSTRAINT chk_apps_owner_consistency
      CHECK (
        (owner_type = 'platform'
          AND owner_organization_id IS NULL
          AND owner_uid IS NULL)
        OR (owner_type = 'organization'
          AND owner_organization_id IS NOT NULL
          AND owner_uid IS NULL)
        OR (owner_type = 'user'
          AND owner_uid IS NOT NULL
          AND owner_organization_id IS NULL)
        OR (owner_type = 'dynamic-client-registration'
          AND owner_organization_id IS NULL
          AND owner_uid IS NULL)
      );
  `.execute(db);

  // --- APPS: RFC 7591 metadata columns -----------------------------------
  for (const column of APPS_METADATA_COLUMNS) {
    await sql`
      ALTER TABLE APPS
        ADD COLUMN IF NOT EXISTS ${sql.raw(column)};
    `.execute(db);
  }

  await sql`
    ALTER TABLE APPS
      DROP CONSTRAINT IF EXISTS chk_apps_token_endpoint_auth_method;
  `.execute(db);
  await sql`
    ALTER TABLE APPS
      ADD CONSTRAINT chk_apps_token_endpoint_auth_method
      CHECK (
        token_endpoint_auth_method IS NULL
        OR token_endpoint_auth_method IN ('none', 'client_secret_basic', 'client_secret_post')
      );
  `.execute(db);

  // Admin listing / filtering of dynamically registered clients.
  await sql`
    CREATE INDEX IF NOT EXISTS apps_owner_type_created_at_idx
      ON APPS (owner_type, created_at DESC);
  `.execute(db);

  // --- API_SERVERS: dynamic-client policy --------------------------------
  await sql`
    ALTER TABLE API_SERVERS
      ADD COLUMN IF NOT EXISTS allow_dynamic_clients BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS resource_url_match_mode TEXT NOT NULL DEFAULT 'exact';
  `.execute(db);

  await sql`
    ALTER TABLE API_SERVERS
      DROP CONSTRAINT IF EXISTS chk_api_servers_resource_url_match_mode;
  `.execute(db);
  await sql`
    ALTER TABLE API_SERVERS
      ADD CONSTRAINT chk_api_servers_resource_url_match_mode
      CHECK (resource_url_match_mode IN ('exact', 'prefix'));
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  // --- API_SERVERS -------------------------------------------------------
  await sql`
    ALTER TABLE API_SERVERS
      DROP CONSTRAINT IF EXISTS chk_api_servers_resource_url_match_mode;
  `.execute(db);
  await sql`
    ALTER TABLE API_SERVERS
      DROP COLUMN IF EXISTS resource_url_match_mode,
      DROP COLUMN IF EXISTS allow_dynamic_clients;
  `.execute(db);

  // --- APPS --------------------------------------------------------------
  await sql`DROP INDEX IF EXISTS apps_owner_type_created_at_idx;`.execute(db);

  await sql`
    ALTER TABLE APPS
      DROP CONSTRAINT IF EXISTS chk_apps_token_endpoint_auth_method;
  `.execute(db);
  for (const column of APPS_METADATA_COLUMN_NAMES) {
    await sql`
      ALTER TABLE APPS
        DROP COLUMN IF EXISTS ${sql.raw(column)};
    `.execute(db);
  }

  // Dynamically registered clients have no representation in the
  // three-value ownership model, so they are removed (their callback
  // URLs, client secrets, authorizations and issued tokens cascade).
  await sql`
    DELETE FROM APPS WHERE owner_type = 'dynamic-client-registration';
  `.execute(db);

  await sql`
    ALTER TABLE APPS
      DROP CONSTRAINT IF EXISTS chk_apps_owner_consistency;
  `.execute(db);
  await sql`
    ALTER TABLE APPS
      ADD CONSTRAINT chk_apps_owner_consistency
      CHECK (
        (owner_type = 'platform'
          AND owner_organization_id IS NULL
          AND owner_uid IS NULL)
        OR (owner_type = 'organization'
          AND owner_organization_id IS NOT NULL
          AND owner_uid IS NULL)
        OR (owner_type = 'user'
          AND owner_uid IS NOT NULL
          AND owner_organization_id IS NULL)
      );
  `.execute(db);

  await sql`
    ALTER TABLE APPS
      DROP CONSTRAINT IF EXISTS chk_apps_owner_type;
  `.execute(db);
  await sql`
    ALTER TABLE APPS
      ADD CONSTRAINT chk_apps_owner_type
      CHECK (owner_type IN ('platform', 'organization', 'user'));
  `.execute(db);
}
