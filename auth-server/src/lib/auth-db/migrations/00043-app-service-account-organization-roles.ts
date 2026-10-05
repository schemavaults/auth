// 00043-app-service-account-organization-roles.ts
//
// Organization membership for the SERVICE ACCOUNT of an organization-owned
// client application (the machine identity of the OAuth2
// client_credentials grant, migration 00038). Service accounts cannot
// accept invitations, so an app's managers opt its service account into
// the owning organization instead: a row here makes the service account a
// member of the organization that owns the app, with the given role, for
// every organization membership check (most importantly the
// resource-server role lookup behind the server SDK's
// `required_organization` / `organization` route guards).
//
// The membership is VIRTUAL (see listUserOrganizationMemberships): it is
// not an ORGANIZATION_MEMBERSHIP_ROLES row, and the organization is not
// stored here. It is read from the app's current owner at lookup time, so
// it only applies while the app is organization-owned, never counts
// against the membership limit, and survives the service account being
// removed and recreated (the setting belongs to the app). It goes with
// the app (ON DELETE CASCADE).

import type { Kysely } from "@schemavaults/dbh";
import { sql } from "@/sql";

export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS APP_SERVICE_ACCOUNT_ORGANIZATION_ROLES (
      app_id TEXT PRIMARY KEY,
      role TEXT NOT NULL,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL,
      updated_by UUID,
      CONSTRAINT fk_service_account_organization_role_app
        FOREIGN KEY (app_id) REFERENCES APPS(app_id) ON DELETE CASCADE,
      CONSTRAINT fk_service_account_organization_role_updated_by
        FOREIGN KEY (updated_by) REFERENCES USERS(uid) ON DELETE SET NULL,
      CONSTRAINT chk_service_account_organization_role
        CHECK (role IN ('member', 'owner'))
    );
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .dropTable("app_service_account_organization_roles")
    .ifExists()
    .execute();
}
