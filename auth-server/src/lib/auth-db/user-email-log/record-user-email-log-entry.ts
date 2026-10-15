import "server-only";
import type { Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import isValidUuid from "@/lib/is-valid-uuid";
import type { NewUserEmailLogRow } from "./user-email-log-table";

/** Longest failure_reason stored; longer reasons are cut off. */
export const MAX_FAILURE_REASON_LENGTH = 500;

export async function recordUserEmailLogEntry(
  db: Kysely<AuthDatabase>,
  row: Omit<NewUserEmailLogRow, "email_log_id">,
): Promise<void> {
  if (!isValidUuid(row.uid)) {
    throw new TypeError("Invalid uid: expected a valid UUID");
  }
  if (row.requested_by != null && !isValidUuid(row.requested_by)) {
    throw new TypeError("Invalid requested_by: expected a valid UUID or null");
  }
  const failure_reason: string | null =
    typeof row.failure_reason === "string"
      ? row.failure_reason.slice(0, MAX_FAILURE_REASON_LENGTH)
      : null;
  await db
    .insertInto("user_email_log")
    .values({ ...row, failure_reason })
    .execute();
}

export default recordUserEmailLogEntry;
