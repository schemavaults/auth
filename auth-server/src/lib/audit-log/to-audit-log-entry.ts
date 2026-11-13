import type { AuditEventRow, AuditEventsCursor, AuditEventsPage } from "@/lib/auth-db/audit-events";
import type { AuditLogEntry, AuditLogPage, AuditLogParty } from "./audit-log-entry-schema";

/** Whose log an entry is being shown in. */
export type AuditLogViewer = { kind: "user"; uid: string } | { kind: "organization" };

function party(uid: string | null, email: string | null): AuditLogParty | null {
  return uid === null && email === null ? null : { uid, email };
}

/**
 * Whether the viewer may see the address and `User-Agent` of the request
 * behind an event. They describe the person who made the request, so they
 * are only shown to that person: in their own log, on events they caused,
 * and on events nobody was signed in for (a failed sign-in to their
 * account, where the address is exactly what they need to see). An
 * organization's log never shows them.
 */
function mayViewRequestDetails(row: AuditEventRow, viewer: AuditLogViewer): boolean {
  if (viewer.kind !== "user") return false;
  if (row.actor_uid === viewer.uid) return true;
  return row.actor_uid === null && row.actor_email === null && row.subject_uid === viewer.uid;
}

/** The API form of an AUDIT_EVENTS row, as `viewer` may see it. */
export function toAuditLogEntry(row: AuditEventRow, viewer: AuditLogViewer): AuditLogEntry {
  const showRequest: boolean = mayViewRequestDetails(row, viewer);
  return {
    audit_event_id: row.audit_event_id,
    created_at: Number(row.created_at),
    event_type: row.event_type,
    actor: party(row.actor_uid, row.actor_email),
    subject: party(row.subject_uid, row.subject_email),
    organization_id: row.organization_id,
    client_app_id: row.client_app_id,
    ip_address: showRequest ? row.ip_address : null,
    user_agent: showRequest ? row.user_agent : null,
    details: row.details,
  };
}

const CURSOR_PATTERN: RegExp = /^(\d{1,16})\.([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

/** The opaque `cursor` naming the event a page ended on. */
export function formatAuditLogCursor(row: Pick<AuditEventRow, "created_at" | "audit_event_id">): string {
  return `${Number(row.created_at)}.${row.audit_event_id}`;
}

/** Null when `cursor` is not one formatAuditLogCursor() produced. */
export function parseAuditLogCursor(cursor: string): AuditEventsCursor | null {
  const match = CURSOR_PATTERN.exec(cursor);
  if (!match || match[1] === undefined || match[2] === undefined) return null;
  return { created_at: Number(match[1]), audit_event_id: match[2].toLowerCase() };
}

/** The API form of one page of rows, as `viewer` may see it. */
export function toAuditLogPage(page: AuditEventsPage, viewer: AuditLogViewer): AuditLogPage {
  const last = page.events.at(-1);
  return {
    entries: page.events.map((row) => toAuditLogEntry(row, viewer)),
    next_cursor: page.has_more && last ? formatAuditLogCursor(last) : null,
  };
}
