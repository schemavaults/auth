import "server-only";
import type { Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import {
  recordUserEmailLogEntry,
  type UserEmailLogEmailType,
  type UserEmailLogSource,
  type UserEmailLogStatus,
} from "@/lib/auth-db/user-email-log";
import captureServerException from "@/lib/captureServerException";
import MailServerNotConfiguredError from "@/lib/error/MailServerNotConfiguredError";

/** Who an e-mail is logged against and what triggered it. */
export interface UserEmailLogDetails {
  /** The user the e-mail is about (and addressed to). */
  uid: string;
  source: UserEmailLogSource;
  /** The administrator behind an `admin_request`. */
  requested_by?: string | null;
}

export interface SendAndLogUserEmailOptions extends UserEmailLogDetails {
  db: Kysely<AuthDatabase>;
  email_type: UserEmailLogEmailType;
  recipient: string;
  /** Sends the e-mail; resolves once the mail server accepted it. */
  send: () => Promise<void>;
}

/**
 * Sends a verification or password reset e-mail with `send` and records the
 * attempt in USER_EMAIL_LOG (the "Email Log" timeline on
 * /admin/users/[uid]): `sent` once the mail server accepted it, `failed`
 * with the reason otherwise. A failed send is rethrown after it is
 * recorded, so callers keep handling (and capturing) it as before.
 *
 * Recording never throws: the log is diagnostics, so a failure to write it
 * is captured to the ERRORS table and the e-mail flow carries on.
 */
export async function sendAndLogUserEmail({
  db,
  email_type,
  recipient,
  uid,
  source,
  requested_by = null,
  send,
}: SendAndLogUserEmailOptions): Promise<void> {
  const record = async (
    status: UserEmailLogStatus,
    failure_reason: string | null,
  ): Promise<void> => {
    try {
      await recordUserEmailLogEntry(db, {
        uid,
        email_type,
        source,
        recipient,
        status,
        failure_reason,
        requested_by,
        created_at: Date.now(),
      });
    } catch (e: unknown) {
      await captureServerException(db, e, {
        op_name: "sendAndLogUserEmail.recordUserEmailLogEntry",
        uid,
        context: { email_type, source, status, nonFatal: true },
      });
    }
  };

  try {
    await send();
  } catch (e: unknown) {
    await record("failed", describeSendFailure(e));
    throw e;
  }
  await record("sent", null);
}

/** A short, admin-facing reason for a failed send. */
function describeSendFailure(e: unknown): string {
  if (e instanceof MailServerNotConfiguredError) {
    return "The mail server is not configured";
  }
  if (e instanceof Error && e.message.length > 0) {
    return e.message;
  }
  return "Unknown error";
}

export default sendAndLogUserEmail;
