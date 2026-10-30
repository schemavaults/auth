import type { Generated, Insertable, Selectable } from "@schemavaults/dbh";

/**
 * The e-mails recorded in USER_EMAIL_LOG: verification and password reset
 * links (migration 00044) and the MFA security alerts (migration 00049).
 */
export const userEmailLogEmailTypes = [
  "email_verification",
  "password_reset",
  "mfa_enabled_alert",
  "mfa_removed_alert",
  "mfa_admin_reset_alert",
  "mfa_recovery_codes_regenerated_alert",
] as const;
export type UserEmailLogEmailType = (typeof userEmailLogEmailTypes)[number];

/**
 * What triggered the e-mail: the verification e-mail sent at sign-up,
 * something the user did themselves (verification resend, forgotten
 * password, an MFA change), or an administrator's action from
 * /admin/users/[uid] (a verification resend, an MFA reset).
 */
export const userEmailLogSources = ["registration", "user_request", "admin_request"] as const;
export type UserEmailLogSource = (typeof userEmailLogSources)[number];

/** Whether the mail server accepted the e-mail. */
export const userEmailLogStatuses = ["sent", "failed"] as const;
export type UserEmailLogStatus = (typeof userEmailLogStatuses)[number];

export interface UserEmailLogTable {
  email_log_id: Generated<string>;
  uid: string;
  email_type: UserEmailLogEmailType;
  source: UserEmailLogSource;
  /** The address the e-mail was sent to, as it was at the time. */
  recipient: string;
  status: UserEmailLogStatus;
  /** Why a failed attempt failed; null for sent e-mails. */
  failure_reason: string | null;
  /** The administrator behind an admin_request; null otherwise. */
  requested_by: string | null;
  created_at: number;
}

export type UserEmailLogRow = Selectable<UserEmailLogTable>;
export type NewUserEmailLogRow = Insertable<UserEmailLogTable>;

/** A USER_EMAIL_LOG row as the admin e-mail log lists it. */
export type UserEmailLogEntry = UserEmailLogRow & {
  /** Current address of the `requested_by` administrator, when there is one. */
  requested_by_email: string | null;
};
