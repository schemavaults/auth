// 00009-add-web-column-to-apps.ts
// Adds the 'web' boolean column to the apps table to indicate if an app is a web application
// Web apps receive authorization codes via URL redirect, native apps via POST request

import type { Kysely } from "@schemavaults/dbh";
import { sql } from "@/sql";

export async function up(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE apps ADD COLUMN web BOOLEAN DEFAULT TRUE`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE apps DROP COLUMN web`.execute(db);
}
