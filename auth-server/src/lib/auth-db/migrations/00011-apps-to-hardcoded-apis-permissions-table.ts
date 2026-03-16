// 00011-apps-to-hardcoded-apis-permissions-table.ts

import type { Kysely } from "@schemavaults/dbh";
import { sql } from "@/sql";

async function createAppsToHardcodedApisPermissionsTable(db: Kysely<any>) {
  const createTable = sql`
    CREATE TABLE IF NOT EXISTS APPS_TO_HARDCODED_APIS_PERMISSIONS (
      client_app_id UUID NOT NULL,
      api_server_id TEXT NOT NULL,
      created_at BIGINT NOT NULL,
      created_by UUID,
      CONSTRAINT fk_hardcoded_perm_app FOREIGN KEY (client_app_id) REFERENCES APPS(app_id) ON DELETE CASCADE,
      PRIMARY KEY (client_app_id, api_server_id),
      CONSTRAINT fk_hardcoded_perm_creator FOREIGN KEY (created_by) REFERENCES USERS(uid) ON DELETE SET NULL
    );
  `;
  await createTable.execute(db);
}

export async function up(db: Kysely<any>): Promise<void> {
  await createAppsToHardcodedApisPermissionsTable(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('apps_to_hardcoded_apis_permissions').execute();
}
