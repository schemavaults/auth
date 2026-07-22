// 00031-user-created-by-fks.ts
//
// Completes the ON DELETE story for user rows so a user can be fully
// deleted with a single DELETE FROM USERS. Every other user-referencing
// table already declares a foreign key (CASCADE for owned rows like
// passwords/tokens/MFA factors, SET NULL for audit-style columns like
// SERVER_SETTINGS.updated_by) — these two columns were the only
// unconstrained references left, so deleting a user stranded dangling
// UUIDs behind:
//
//   1. ORGANIZATIONS.created_by (baseline 00001, NOT NULL, no FK)
//   2. INVITE_CODES.created_by  (baseline 00001, nullable, no FK)
//
// Both are informational "who created this" columns whose zod schemas
// (organizationDefinitionSchema / inviteCodeDefinitionSchema) already
// treat the value as optional, so they get ON DELETE SET NULL — the
// resource outlives its creator. ORGANIZATIONS.created_by must drop its
// NOT NULL for that to be possible. Any pre-existing dangling values are
// nulled out first so the ADD CONSTRAINT cannot fail on legacy rows.

import type { Kysely } from "@schemavaults/dbh";
import { sql } from "@/sql";

export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    ALTER TABLE ORGANIZATIONS
    ALTER COLUMN created_by DROP NOT NULL;
  `.execute(db);

  await sql`
    UPDATE ORGANIZATIONS
    SET created_by = NULL
    WHERE created_by IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM USERS WHERE USERS.uid = ORGANIZATIONS.created_by
      );
  `.execute(db);

  await sql`
    ALTER TABLE ORGANIZATIONS
    DROP CONSTRAINT IF EXISTS fk_org_created_by;
  `.execute(db);

  await sql`
    ALTER TABLE ORGANIZATIONS
    ADD CONSTRAINT fk_org_created_by
    FOREIGN KEY (created_by) REFERENCES USERS(uid) ON DELETE SET NULL;
  `.execute(db);

  await sql`
    UPDATE INVITE_CODES
    SET created_by = NULL
    WHERE created_by IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM USERS WHERE USERS.uid = INVITE_CODES.created_by
      );
  `.execute(db);

  await sql`
    ALTER TABLE INVITE_CODES
    DROP CONSTRAINT IF EXISTS fk_invite_code_created_by;
  `.execute(db);

  await sql`
    ALTER TABLE INVITE_CODES
    ADD CONSTRAINT fk_invite_code_created_by
    FOREIGN KEY (created_by) REFERENCES USERS(uid) ON DELETE SET NULL;
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`
    ALTER TABLE INVITE_CODES
    DROP CONSTRAINT IF EXISTS fk_invite_code_created_by;
  `.execute(db);

  await sql`
    ALTER TABLE ORGANIZATIONS
    DROP CONSTRAINT IF EXISTS fk_org_created_by;
  `.execute(db);

  // NOT NULL is intentionally not restored on ORGANIZATIONS.created_by:
  // rows may now legitimately hold NULL (creator deleted), and
  // re-adding the constraint would fail on them. The column stays
  // nullable, which every reader already tolerates.
}
