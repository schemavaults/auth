// 00036-user-profile-name-fields.ts
// User-editable profile name fields: a personal name split into
// first/middle/last parts, a public display name (exposed to OIDC RPs
// as the `name` claim under the `profile` scope), and a distinct
// username. All are optional — existing accounts simply have none set.
//
// Usernames are unique per deployment, case-insensitively: the stored
// casing is preserved for display while the unique index on
// LOWER(username) prevents case-variants of one username from being
// claimed by distinct accounts (mirroring the email index from
// migration 00034). NULL usernames are exempt (Postgres unique indexes
// ignore NULL keys), so accounts without a username never collide.

import type { Kysely } from "@schemavaults/dbh";
import { sql } from "@/sql";

export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    ALTER TABLE USERS
      ADD COLUMN IF NOT EXISTS first_name TEXT,
      ADD COLUMN IF NOT EXISTS middle_name TEXT,
      ADD COLUMN IF NOT EXISTS last_name TEXT,
      ADD COLUMN IF NOT EXISTS display_name TEXT,
      ADD COLUMN IF NOT EXISTS username TEXT;
  `.execute(db);

  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_unique
      ON USERS (LOWER(username));
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`DROP INDEX IF EXISTS users_username_lower_unique;`.execute(db);
  await sql`
    ALTER TABLE USERS
      DROP COLUMN IF EXISTS first_name,
      DROP COLUMN IF EXISTS middle_name,
      DROP COLUMN IF EXISTS last_name,
      DROP COLUMN IF EXISTS display_name,
      DROP COLUMN IF EXISTS username;
  `.execute(db);
}
