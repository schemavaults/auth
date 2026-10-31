// 00049-user-email-log-mfa-alerts.ts
// USER_EMAIL_LOG also records the MFA security alerts
// (lib/mfa/send-mfa-security-alert-email.ts), so administrators see them,
// and whether the mail server accepted them, on the "Email Log" timeline of
// /admin/users/[uid]. Widens chk_user_email_log_email_type with one type per
// alert: 'mfa_enabled_alert', 'mfa_removed_alert', 'mfa_admin_reset_alert'
// and 'mfa_recovery_codes_regenerated_alert'. Their source is
// 'user_request' when the user changed their own MFA and 'admin_request'
// (with requested_by) for an administrator's reset.

import type { Kysely } from "@schemavaults/dbh";
import { sql } from "@/sql";

export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    ALTER TABLE USER_EMAIL_LOG
      DROP CONSTRAINT IF EXISTS chk_user_email_log_email_type;
  `.execute(db);
  await sql`
    ALTER TABLE USER_EMAIL_LOG
      ADD CONSTRAINT chk_user_email_log_email_type
      CHECK (email_type IN (
        'email_verification',
        'password_reset',
        'mfa_enabled_alert',
        'mfa_removed_alert',
        'mfa_admin_reset_alert',
        'mfa_recovery_codes_regenerated_alert'
      ));
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  // The narrower constraint cannot hold the MFA alert rows: they go.
  await sql`
    DELETE FROM USER_EMAIL_LOG
    WHERE email_type NOT IN ('email_verification', 'password_reset');
  `.execute(db);
  await sql`
    ALTER TABLE USER_EMAIL_LOG
      DROP CONSTRAINT IF EXISTS chk_user_email_log_email_type;
  `.execute(db);
  await sql`
    ALTER TABLE USER_EMAIL_LOG
      ADD CONSTRAINT chk_user_email_log_email_type
      CHECK (email_type IN ('email_verification', 'password_reset'));
  `.execute(db);
}
