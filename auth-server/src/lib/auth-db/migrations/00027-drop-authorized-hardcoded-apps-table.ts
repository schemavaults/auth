// 00027-drop-authorized-hardcoded-apps-table.ts
//
// feature/whitelabel reduced the hardcoded apps to only the auth server
// itself, which is always implicitly authorized and never written to this
// table. That leaves authorized_hardcoded_apps permanently unreachable: no
// code path can insert into it anymore, and its remaining rows — grants for
// formerly-hardcoded apps like "schemavaults-web" — no longer resolve to any
// app definition and crashed the /account authorized-apps listing. Drop the
// table entirely rather than leave dead data to drift.

import type { Kysely } from "@schemavaults/dbh";
import { sql } from "@/sql";

export async function up(db: Kysely<any>): Promise<void> {
  await sql`DROP TABLE IF EXISTS authorized_hardcoded_apps;`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  // Recreates the structure from 00013; the dropped rows are not restored.
  // They were unusable dead data (no hardcoded app definitions exist for
  // them), so there is nothing meaningful to bring back.
  await sql`
    CREATE TABLE IF NOT EXISTS authorized_hardcoded_apps (
      user_hardcoded_app_authorization_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      app_id TEXT NOT NULL,
      uid UUID NOT NULL,
      authorized_at BIGINT NOT NULL CHECK (authorized_at > 0),
      CONSTRAINT fk_user FOREIGN KEY (uid) REFERENCES users(uid) ON DELETE CASCADE,
      UNIQUE (app_id, uid)
    );
  `.execute(db);
}
