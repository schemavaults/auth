import type { ColumnType, Generated, Insertable, Selectable } from "@schemavaults/dbh";
import type { AuditEventType } from "@/lib/audit-log/event-types";

/**
 * AUDIT_EVENTS (migration 00054): one row per security-relevant action.
 * See the migration for what each column means and what happens to the
 * rows of a deleted user or organization.
 */
export interface AuditEventsTable {
  audit_event_id: Generated<string>;
  /** When the event happened (Unix epoch ms). */
  created_at: number;
  event_type: AuditEventType;
  /** Who did it; null when nobody was signed in, or the server did it. */
  actor_uid: string | null;
  /** The actor's e-mail address at the time. */
  actor_email: string | null;
  /** The account the event is about, when there is one. */
  subject_uid: string | null;
  /** The subject's e-mail address at the time. */
  subject_email: string | null;
  /** The organization whose log the event belongs to. */
  organization_id: string | null;
  /** The client application involved (a sign-in, an authorization). */
  client_app_id: string | null;
  /** Address of the request that caused the event. */
  ip_address: string | null;
  /** `User-Agent` of the request that caused the event. */
  user_agent: string | null;
  /** Event-specific details. Written as JSON text, read back parsed. */
  details: ColumnType<Record<string, unknown> | null, string | null, never>;
}

export type AuditEventRow = Selectable<AuditEventsTable>;
export type NewAuditEventRow = Insertable<AuditEventsTable>;
