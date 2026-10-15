// 00044-user-email-log-table.ts
// Creates the USER_EMAIL_LOG table: one row per attempt to e-mail a user a
// verification link or a password reset link (lib/mail/user-email-log.ts),
// whether the mail server accepted it or not. Administrators read a user's
// rows as the "Email Log" timeline on /admin/users/[uid].
//
// - email_type is what was sent; source is what triggered it (registration,
//   the user asking for it, or an administrator's resend). requested_by is
//   the administrator for admin_request rows.
// - recipient is the address the e-mail went to, kept as sent so the log
//   stays accurate if the account's address later changes.
// - failure_reason says why a 'failed' attempt failed (mail server not
//   configured, the mail server's refusal, ...); the full error is still
//   captured to the ERRORS table by the caller.
// - Rows go with the user (ON DELETE CASCADE); requested_by is set to NULL
//   when the administrator's account is deleted.

import type { Kysely } from "@schemavaults/dbh";
import { sql } from "@/sql";

export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS USER_EMAIL_LOG (
      email_log_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      uid UUID NOT NULL,
      email_type TEXT NOT NULL,
      source TEXT NOT NULL,
      recipient TEXT NOT NULL,
      status TEXT NOT NULL,
      failure_reason TEXT,
      requested_by UUID,
      created_at BIGINT NOT NULL CHECK (created_at > 0),
      CONSTRAINT fk_user_email_log_uid
        FOREIGN KEY (uid) REFERENCES USERS(uid) ON DELETE CASCADE,
      CONSTRAINT fk_user_email_log_requested_by
        FOREIGN KEY (requested_by) REFERENCES USERS(uid) ON DELETE SET NULL,
      CONSTRAINT chk_user_email_log_email_type
        CHECK (email_type IN ('email_verification', 'password_reset')),
      CONSTRAINT chk_user_email_log_source
        CHECK (source IN ('registration', 'user_request', 'admin_request')),
      CONSTRAINT chk_user_email_log_status
        CHECK (status IN ('sent', 'failed'))
    );
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS user_email_log_uid_created_at_idx
    ON USER_EMAIL_LOG (uid, created_at DESC);
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("user_email_log").ifExists().execute();
}
