import "server-only";
import { after } from "next/server";
import { insertAuditEvent, type NewAuditEventRow } from "@/lib/auth-db/audit-events";
import { ServerlessDatabase } from "@/lib/auth-db/serverless-database";
import reportServerException from "@/lib/reportServerException";
import { buildAuditEventRow, type RecordAuditEventOptions } from "./record-audit-event";

async function insertWithOwnDatabaseHandle(row: NewAuditEventRow): Promise<void> {
  try {
    await using dbh = ServerlessDatabase.createDBH();
    await insertAuditEvent(dbh.db, row);
  } catch (e: unknown) {
    await reportServerException(e, {
      op_name: "recordAuditEventAfterResponse",
      uid: row.actor_uid ?? row.subject_uid ?? undefined,
      context: { event_type: row.event_type, nonFatal: true },
    });
  }
}

/**
 * recordAuditEvent() for a branch whose response time must not depend on
 * the write: the event is written once the response has been sent (Next.js
 * `after()`), on a database handle of its own.
 *
 * Use it where an unauthenticated caller could otherwise time the request
 * to learn something. The wrong-password branch of the login handler is
 * the case in point: it must take as long as the unknown-email branch,
 * which records nothing, or the difference reveals which e-mail addresses
 * have an account.
 *
 * The row is built now, from the request as it is (its address and
 * `User-Agent`). No address is looked up, so pass each party's `email`.
 * Like recordAuditEvent(), it never throws.
 */
export function recordAuditEventAfterResponse(options: RecordAuditEventOptions): void {
  let row: NewAuditEventRow;
  try {
    row = buildAuditEventRow(options);
  } catch (e: unknown) {
    console.error("recordAuditEventAfterResponse could not build the audit event:", e);
    return;
  }
  try {
    after(() => insertWithOwnDatabaseHandle(row));
  } catch {
    // Not inside a request (a script, a test): nothing to wait for.
    void insertWithOwnDatabaseHandle(row);
  }
}

export default recordAuditEventAfterResponse;
