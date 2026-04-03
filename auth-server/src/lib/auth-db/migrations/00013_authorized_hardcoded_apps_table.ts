// 00013_authorized_hardcoded_apps_table.ts

import type { Kysely } from "@schemavaults/dbh";
import { sql } from "@/sql";

export async function up(db: Kysely<any>): Promise<void> {
  const createAuthorizedHardcodedAppsTable = sql`
    CREATE TABLE IF NOT EXISTS authorized_hardcoded_apps (
      user_hardcoded_app_authorization_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      app_id TEXT NOT NULL,
      uid UUID NOT NULL,
      authorized_at BIGINT NOT NULL CHECK (authorized_at > 0),
      CONSTRAINT fk_user FOREIGN KEY (uid) REFERENCES users(uid) ON DELETE CASCADE,
      UNIQUE (app_id, uid)
    );
  `;
  await createAuthorizedHardcodedAppsTable.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("authorized_hardcoded_apps").execute();
}
