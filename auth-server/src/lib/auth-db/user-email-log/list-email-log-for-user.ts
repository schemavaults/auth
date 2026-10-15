import "server-only";
import type { Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import isValidUuid from "@/lib/is-valid-uuid";
import type { UserEmailLogEntry } from "./user-email-log-table";

export interface ListEmailLogForUserOptions {
  limit?: number;
}

/**
 * A user's USER_EMAIL_LOG rows, newest first, each with the current e-mail
 * address of the administrator behind an `admin_request` (null when there
 * is none, or their account was deleted).
 */
export async function listEmailLogForUser(
  db: Kysely<AuthDatabase>,
  uid: string,
  options: ListEmailLogForUserOptions = {},
): Promise<readonly UserEmailLogEntry[]> {
  if (!isValidUuid(uid)) {
    throw new TypeError("Invalid uid: expected a valid UUID");
  }

  const rows = await db
    .selectFrom("user_email_log")
    .leftJoin("users as requester", "requester.uid", "user_email_log.requested_by")
    .selectAll("user_email_log")
    .select("requester.email as requested_by_email")
    .where("user_email_log.uid", "=", uid)
    .orderBy("user_email_log.created_at", "desc")
    .limit(options.limit ?? 100)
    .execute();

  // BIGINT columns come back from the driver as decimal strings.
  return rows.map((row) => ({
    ...row,
    created_at: Number(row.created_at),
    requested_by_email: row.requested_by_email ?? null,
  }));
}

export default listEmailLogForUser;
