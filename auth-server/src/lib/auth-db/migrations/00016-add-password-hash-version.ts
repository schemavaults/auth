// 00015-add-password-hash-version.ts
// Adds the 'password_hash_version' column to the passwords table so that
// existing global-salt hashes (version 1) can be distinguished from the new
// per-user-salt (uid-based) hashes (version 2).
// Existing rows default to 1 (legacy). New rows written by register, reset,
// or lazy-upgrade-on-login write 2.

import type { Kysely } from "@schemavaults/dbh";
import { sql } from "@/sql";

export async function up(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE passwords ADD COLUMN password_hash_version INT NOT NULL DEFAULT 1`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE passwords DROP COLUMN password_hash_version`.execute(db);
}
