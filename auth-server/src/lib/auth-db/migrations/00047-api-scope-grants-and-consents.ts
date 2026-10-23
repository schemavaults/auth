// 00047-api-scope-grants-and-consents.ts
//
// Who may be granted an API server's scopes (migration 00046), and what
// each user agreed to:
//
// - APP_API_SCOPE_POLICIES holds, per app-to-API connection, whether the
//   scopes users may grant the app are restricted (restrict_user_scopes).
//   No row (every existing connection) = unrestricted: users may grant the
//   app every scope the API server defines; restricted = only the app's
//   `user` rows in APP_API_SCOPE_GRANTS. A separate table rather than a
//   column on APPS_TO_APIS_PERMISSIONS, whose rows older code reads with
//   SELECT * into a strict schema.
// - APP_API_SCOPE_GRANTS lists, per connection, the scopes allowed for the
//   `user` grantee (when restricted) and for the `service_account` grantee
//   (the app's client_credentials tokens; none by default). Rows go with
//   their connection and with their scope.
// - API_SERVER_SCOPES gains allow_dynamic_clients BOOLEAN NOT NULL DEFAULT
//   true: whether dynamically registered clients (no connection) may be
//   granted the scope.
// - USER_APP_SCOPE_CONSENTS records the API scopes each user granted each
//   authorized app. Rows go with the app authorization (revoking the app
//   withdraws every scope), the user, the app and the scope.

import type { Kysely } from "@schemavaults/dbh";
import { sql } from "@/sql";

export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS APP_API_SCOPE_POLICIES (
      client_app_id TEXT NOT NULL,
      api_server_id TEXT NOT NULL,
      restrict_user_scopes BOOLEAN NOT NULL DEFAULT false,
      updated_at BIGINT NOT NULL,
      updated_by UUID,
      PRIMARY KEY (client_app_id, api_server_id),
      CONSTRAINT fk_app_api_scope_policy_connection
        FOREIGN KEY (client_app_id, api_server_id)
        REFERENCES APPS_TO_APIS_PERMISSIONS(client_app_id, api_server_id) ON DELETE CASCADE,
      CONSTRAINT fk_app_api_scope_policy_updated_by
        FOREIGN KEY (updated_by) REFERENCES USERS(uid) ON DELETE SET NULL
    );
  `.execute(db);

  await sql`
    ALTER TABLE API_SERVER_SCOPES
      ADD COLUMN IF NOT EXISTS allow_dynamic_clients BOOLEAN NOT NULL DEFAULT true;
  `.execute(db);

  await sql`
    CREATE TABLE IF NOT EXISTS APP_API_SCOPE_GRANTS (
      client_app_id TEXT NOT NULL,
      api_server_id TEXT NOT NULL,
      api_server_scope_id UUID NOT NULL,
      grantee TEXT NOT NULL,
      created_at BIGINT NOT NULL,
      created_by UUID,
      PRIMARY KEY (client_app_id, api_server_scope_id, grantee),
      CONSTRAINT chk_app_api_scope_grants_grantee
        CHECK (grantee IN ('user', 'service_account')),
      CONSTRAINT fk_app_api_scope_grant_connection
        FOREIGN KEY (client_app_id, api_server_id)
        REFERENCES APPS_TO_APIS_PERMISSIONS(client_app_id, api_server_id) ON DELETE CASCADE,
      CONSTRAINT fk_app_api_scope_grant_scope
        FOREIGN KEY (api_server_scope_id) REFERENCES API_SERVER_SCOPES(api_server_scope_id) ON DELETE CASCADE,
      CONSTRAINT fk_app_api_scope_grant_created_by
        FOREIGN KEY (created_by) REFERENCES USERS(uid) ON DELETE SET NULL
    );
  `.execute(db);
  await sql`
    CREATE INDEX IF NOT EXISTS idx_app_api_scope_grants_connection
      ON APP_API_SCOPE_GRANTS (client_app_id, api_server_id);
  `.execute(db);

  await sql`
    CREATE TABLE IF NOT EXISTS USER_APP_SCOPE_CONSENTS (
      uid UUID NOT NULL,
      client_app_id TEXT NOT NULL,
      api_server_id TEXT NOT NULL,
      api_server_scope_id UUID NOT NULL,
      granted_at BIGINT NOT NULL,
      PRIMARY KEY (uid, client_app_id, api_server_scope_id),
      CONSTRAINT fk_user_app_scope_consent_authorization
        FOREIGN KEY (client_app_id, uid) REFERENCES AUTHORIZED_APPS(app_id, uid) ON DELETE CASCADE,
      CONSTRAINT fk_user_app_scope_consent_scope
        FOREIGN KEY (api_server_scope_id) REFERENCES API_SERVER_SCOPES(api_server_scope_id) ON DELETE CASCADE
    );
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`DROP TABLE IF EXISTS USER_APP_SCOPE_CONSENTS;`.execute(db);
  await sql`DROP TABLE IF EXISTS APP_API_SCOPE_GRANTS;`.execute(db);
  await sql`
    ALTER TABLE API_SERVER_SCOPES DROP COLUMN IF EXISTS allow_dynamic_clients;
  `.execute(db);
  await sql`DROP TABLE IF EXISTS APP_API_SCOPE_POLICIES;`.execute(db);
}
