// 00034-case-insensitive-user-emails.ts
// Emails are treated case-insensitively across register/login: application
// code stores new emails lowercased (create-user.ts) and looks users up by
// LOWER(email) (get-user-by-email.ts). This migration canonicalizes existing
// rows to lowercase and adds a unique index on LOWER(email) so the database
// enforces case-insensitive uniqueness.
//
// If two existing accounts differ only by email casing, the migration fails
// loudly instead of guessing: merging or deleting user accounts is an
// operator decision. Resolve the duplicates manually (e.g. delete the
// unwanted account via /admin) and re-run migrations.

import type { Kysely } from "@schemavaults/dbh";
import { sql } from "@/sql";

export async function up(db: Kysely<any>): Promise<void> {
  const duplicates = await sql<{ email_lower: string; n: number }>`
    SELECT LOWER(email) AS email_lower, COUNT(*)::int AS n
    FROM USERS
    GROUP BY LOWER(email)
    HAVING COUNT(*) > 1;
  `.execute(db);

  if (duplicates.rows.length > 0) {
    const summary: string = duplicates.rows
      .map((row) => `'${row.email_lower}' (${row.n} accounts)`)
      .join(", ");
    throw new Error(
      "Cannot make user emails case-insensitive: multiple accounts exist whose emails differ only by case: " +
        summary +
        ". Resolve the duplicate accounts (e.g. delete the unwanted ones via /admin) and re-run migrations.",
    );
  }

  await sql`
    UPDATE USERS SET email = LOWER(email) WHERE email <> LOWER(email);
  `.execute(db);

  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_unique
      ON USERS (LOWER(email));
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  // The original mixed-case emails are not recoverable; only the index is
  // reversed. Lowercased emails remain valid under the plain UNIQUE(email)
  // constraint from migration 00001.
  await sql`DROP INDEX IF EXISTS users_email_lower_unique;`.execute(db);
}
