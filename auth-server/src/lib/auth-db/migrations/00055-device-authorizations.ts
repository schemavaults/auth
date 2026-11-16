// 00055-device-authorizations.ts
//
// The OAuth 2.0 Device Authorization Grant (RFC 8628): a device that cannot
// show the login page (a CLI, a TV app) asks POST /api/oidc/device_authorization
// for a device code and a user code, the user enters the user code on the
// auth server's /device page and approves (or denies) the request, and the
// device polls POST /api/oidc/token with the device code until then.
//
// - APP_DEVICE_AUTHORIZATION_POLICIES: the client apps whose managers enabled
//   the grant (PUT /api/apps/{app_id}/device-authorization). A row means
//   enabled; there is none for any existing app, so no app can start a device
//   flow until its managers opt in (a device flow lets anyone who knows the
//   app's id show a user a code to approve, so it is off by default). Goes
//   with its app (ON DELETE CASCADE).
// - DEVICE_AUTHORIZATIONS: one row per device authorization request.
//   - device_code_hash / user_code_hash: SHA-256 (hex) of the device code and
//     of the normalized user code; neither is stored in clear. Only one
//     PENDING row may hold a given user code.
//   - requested_scope / resource: what the device asked for (the RFC 8707
//     `resource` whose API scopes the scope may hold).
//   - status: pending -> approved | denied (the user's decision on /device,
//     with uid + decided_at) -> redeemed (the device received its tokens;
//     redeemed_at). An approved row also holds the granted scope and the API
//     server whose API scopes it carries (scope_api_server_id).
//   - interval_seconds: the polling interval the token endpoint enforces; it
//     grows by 5 seconds on every `slow_down` (RFC 8628 §3.5).
//     last_polled_at is when the device last polled.
//   - Rows go with their app and with the user who decided them (ON DELETE
//     CASCADE), and are deleted an hour after they expire.

import type { Kysely } from "@schemavaults/dbh";
import { sql } from "@/sql";

export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS APP_DEVICE_AUTHORIZATION_POLICIES (
      app_id TEXT PRIMARY KEY,
      enabled_at BIGINT NOT NULL CHECK (enabled_at > 0),
      enabled_by UUID,
      CONSTRAINT fk_app_device_authorization_policy_app
        FOREIGN KEY (app_id) REFERENCES APPS(app_id) ON DELETE CASCADE,
      CONSTRAINT fk_app_device_authorization_policy_enabled_by
        FOREIGN KEY (enabled_by) REFERENCES USERS(uid) ON DELETE SET NULL
    );
  `.execute(db);

  await sql`
    CREATE TABLE IF NOT EXISTS DEVICE_AUTHORIZATIONS (
      device_authorization_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      device_code_hash TEXT NOT NULL UNIQUE,
      user_code_hash TEXT NOT NULL,
      client_app_id TEXT NOT NULL,
      requested_scope TEXT,
      resource TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      uid UUID,
      scope TEXT,
      scope_api_server_id TEXT,
      interval_seconds INTEGER NOT NULL CHECK (interval_seconds > 0),
      created_at BIGINT NOT NULL CHECK (created_at > 0),
      expires_at BIGINT NOT NULL,
      last_polled_at BIGINT,
      decided_at BIGINT,
      redeemed_at BIGINT,
      CONSTRAINT fk_device_authorization_client_app
        FOREIGN KEY (client_app_id) REFERENCES APPS(app_id) ON DELETE CASCADE,
      CONSTRAINT fk_device_authorization_uid
        FOREIGN KEY (uid) REFERENCES USERS(uid) ON DELETE CASCADE,
      CONSTRAINT chk_device_authorization_status
        CHECK (status IN ('pending', 'approved', 'denied', 'redeemed')),
      CONSTRAINT chk_device_authorization_decided
        CHECK (status = 'pending' OR (uid IS NOT NULL AND decided_at IS NOT NULL)),
      CONSTRAINT chk_device_authorization_expiry
        CHECK (expires_at > created_at)
    );
  `.execute(db);

  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS device_authorizations_pending_user_code_idx
    ON DEVICE_AUTHORIZATIONS (user_code_hash)
    WHERE status = 'pending';
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS device_authorizations_expires_at_idx
    ON DEVICE_AUTHORIZATIONS (expires_at);
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`DROP TABLE IF EXISTS DEVICE_AUTHORIZATIONS;`.execute(db);
  await sql`DROP TABLE IF EXISTS APP_DEVICE_AUTHORIZATION_POLICIES;`.execute(db);
}
