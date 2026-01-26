// 00006-baseline-app-to-api-permissions-table.ts

import { sql, type Kysely } from "@schemavaults/dbh";

async function createAppToApiPermissionsTable(db: Kysely<any>) {
  const createPermissionsTable = sql`
    CREATE TABLE IF NOT EXISTS APPS_TO_APIS_PERMISSIONS (
      client_app_id UUID NOT NULL,
      api_server_id UUID NOT NULL,
      created_at BIGINT NOT NULL,
      created_by UUID,
      CONSTRAINT fk_app FOREIGN KEY (client_app_id) REFERENCES APPS(app_id) ON DELETE CASCADE,
      CONSTRAINT fk_api FOREIGN KEY (api_server_id) REFERENCES API_SERVERS(api_server_id) ON DELETE CASCADE,
      PRIMARY KEY (client_app_id, api_server_id),
      CONSTRAINT fk_creator FOREIGN KEY (created_by) REFERENCES USERS(uid) ON DELETE SET NULL
    );
  `;
  await createPermissionsTable.execute(db);
}


export async function up(db: Kysely<any>): Promise<void> {
  await createAppToApiPermissionsTable(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('apps_to_apis_permissions').execute()
}
