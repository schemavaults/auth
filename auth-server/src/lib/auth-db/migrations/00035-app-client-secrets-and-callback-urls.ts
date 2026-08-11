// 00035-app-client-secrets-and-callback-urls.ts
//
// OIDC confidential-client support:
//  - APP_CLIENT_SECRETS stores at most one hashed client secret per app
//    (apps with a row are confidential clients; the plaintext secret is
//    never persisted, only its SHA-256 digest).
//  - APP_CALLBACK_URLS stores an optional explicit redirect-URI
//    allowlist per app + environment. When any rows exist for an app in
//    an environment, redirect_uri validation switches from
//    origin-prefix matching (APP_DOMAINS) to exact-URL matching
//    (RFC 6749 §3.1.2.3 simple string comparison).

import type { Kysely } from "@schemavaults/dbh";
import { sql } from "@/sql";

async function createAppClientSecretsTable(db: Kysely<any>): Promise<void> {
  const createTableSql = sql`
    CREATE TABLE IF NOT EXISTS APP_CLIENT_SECRETS (
      app_id TEXT PRIMARY KEY,
      secret_hash TEXT NOT NULL,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL,
      created_by UUID,
      CONSTRAINT fk_client_secret_app
        FOREIGN KEY (app_id) REFERENCES APPS(app_id) ON DELETE CASCADE,
      CONSTRAINT fk_client_secret_created_by
        FOREIGN KEY (created_by) REFERENCES USERS(uid) ON DELETE SET NULL
    );
  `;
  await createTableSql.execute(db);
}

async function createAppCallbackUrlsTable(db: Kysely<any>): Promise<void> {
  // The UNIQUE constraint doubles as the (app_id, environment) lookup
  // index used by redirect_uri validation.
  const createTableSql = sql`
    CREATE TABLE IF NOT EXISTS APP_CALLBACK_URLS (
      app_callback_url_ref_id UUID PRIMARY KEY,
      app_id TEXT NOT NULL,
      callback_url TEXT NOT NULL,
      environment TEXT NOT NULL,
      created_at BIGINT NOT NULL,
      CONSTRAINT fk_callback_url_app
        FOREIGN KEY (app_id) REFERENCES APPS(app_id) ON DELETE CASCADE,
      CONSTRAINT uq_app_callback_url UNIQUE (app_id, environment, callback_url)
    );
  `;
  await createTableSql.execute(db);
}

export async function up(db: Kysely<any>): Promise<void> {
  await createAppClientSecretsTable(db);
  await createAppCallbackUrlsTable(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("app_callback_urls").execute();
  await db.schema.dropTable("app_client_secrets").execute();
}
