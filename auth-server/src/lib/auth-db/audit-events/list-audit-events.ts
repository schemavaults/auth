import "server-only";
import type { Kysely, Transaction } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import type { AuditEventType } from "@/lib/audit-log/event-types";
import isValidUuid from "@/lib/is-valid-uuid";
import type { AuditEventRow } from "./audit-events-table";

type Db = Kysely<AuthDatabase> | Transaction<AuthDatabase>;

/** Position of the last event of a page: the next page starts right after it. */
export interface AuditEventsCursor {
  created_at: number;
  audit_event_id: string;
}

export interface ListAuditEventsOptions {
  /** Page size. */
  limit: number;
  /** Only events older than this one (newest first). */
  after?: AuditEventsCursor;
  /** Only events of this type. */
  event_type?: AuditEventType;
}

export interface AuditEventsPage {
  events: AuditEventRow[];
  /** Whether older events remain after this page. */
  has_more: boolean;
}

type Scope = { uid: string } | { organization_id: string };

async function listAuditEvents(db: Db, scope: Scope, options: ListAuditEventsOptions): Promise<AuditEventsPage> {
  let query = db.selectFrom("audit_events").selectAll();
  if ("uid" in scope) {
    const { uid } = scope;
    query = query.where((eb) => eb.or([eb("subject_uid", "=", uid), eb("actor_uid", "=", uid)]));
  } else {
    query = query.where("organization_id", "=", scope.organization_id);
  }
  if (options.event_type !== undefined) {
    query = query.where("event_type", "=", options.event_type);
  }
  const after = options.after;
  if (after !== undefined) {
    query = query.where((eb) =>
      eb.or([
        eb("created_at", "<", after.created_at),
        eb.and([eb("created_at", "=", after.created_at), eb("audit_event_id", "<", after.audit_event_id)]),
      ]),
    );
  }
  // One row more than the page, to know whether another page follows.
  const rows = await query
    .orderBy("created_at", "desc")
    .orderBy("audit_event_id", "desc")
    .limit(options.limit + 1)
    .execute();

  return {
    // BIGINT columns come back from the driver as decimal strings.
    events: rows.slice(0, options.limit).map((row) => ({ ...row, created_at: Number(row.created_at) })),
    has_more: rows.length > options.limit,
  };
}

/**
 * One page of a user's audit log, newest first: the events about their
 * account and the events they caused.
 */
export async function listAuditEventsForUser(
  db: Db,
  uid: string,
  options: ListAuditEventsOptions,
): Promise<AuditEventsPage> {
  if (!isValidUuid(uid)) {
    throw new TypeError("Invalid uid: expected a valid UUID");
  }
  return listAuditEvents(db, { uid }, options);
}

/** One page of an organization's audit log, newest first. */
export async function listAuditEventsForOrganization(
  db: Db,
  organization_id: string,
  options: ListAuditEventsOptions,
): Promise<AuditEventsPage> {
  return listAuditEvents(db, { organization_id }, options);
}
