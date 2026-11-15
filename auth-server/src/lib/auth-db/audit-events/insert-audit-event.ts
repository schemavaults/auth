import "server-only";
import type { Kysely, Transaction } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import type { NewAuditEventRow } from "./audit-events-table";

/**
 * Inserts one AUDIT_EVENTS row. Call recordAuditEvent()
 * (lib/audit-log/record-audit-event.ts) instead of this from handlers: it
 * fills in the request's address, the e-mail snapshots, and never throws.
 */
export async function insertAuditEvent(
  db: Kysely<AuthDatabase> | Transaction<AuthDatabase>,
  row: NewAuditEventRow,
): Promise<void> {
  await db.insertInto("audit_events").values(row).execute();
}

export default insertAuditEvent;
