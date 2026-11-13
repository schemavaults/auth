import "server-only";
import type { Kysely, Transaction } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import { insertAuditEvent, type NewAuditEventRow } from "@/lib/auth-db/audit-events";
import captureServerException from "@/lib/captureServerException";
import isValidUuid from "@/lib/is-valid-uuid";
import { extractClientIp } from "@/lib/rate-limit/extractClientIp";
import { MAX_AUDIT_EVENT_USER_AGENT_LENGTH, type AuditEventType } from "./event-types";

/** A user an event names. Pass the e-mail when it is at hand: it saves a lookup. */
export interface AuditEventParty {
  uid: string;
  email?: string | null;
}

export interface RecordAuditEventOptions {
  event_type: AuditEventType;
  /** Who did it. Omit when nobody was signed in, or the server did it. */
  actor?: AuditEventParty | null;
  /** The account the event is about (may be the actor). */
  subject?: AuditEventParty | null;
  /** Puts the event in this organization's log. */
  organization_id?: string | null;
  /** The client application involved. */
  client_app_id?: string | null;
  /** The request that caused the event: its address and `User-Agent` are stored. */
  request?: { readonly headers: Headers } | null;
  /** Event-specific details (JSON). Never put secrets, codes or tokens here. */
  details?: Record<string, unknown>;
  /** When it happened (Unix epoch ms); defaults to now. */
  now?: number;
}

// Postgres TEXT and JSONB reject NUL characters.
function withoutNul(text: string): string {
  return text.replaceAll("\u0000", "�");
}

function detailsToJsonText(details: Record<string, unknown> | undefined): string | null {
  if (details === undefined) return null;
  const text: string | undefined = JSON.stringify(details);
  if (text === undefined || text === "{}") return null;
  return text.replaceAll("\\u0000", "\\uFFFD");
}

/**
 * The AUDIT_EVENTS row of an event. `emails` are the addresses looked up
 * for the parties that came without one (by uid).
 */
export function buildAuditEventRow(
  options: RecordAuditEventOptions,
  emails: ReadonlyMap<string, string> = new Map(),
): NewAuditEventRow {
  const party = (p: AuditEventParty | null | undefined): { uid: string | null; email: string | null } => {
    if (!p) return { uid: null, email: null };
    if (!isValidUuid(p.uid)) {
      throw new TypeError("Invalid audit event party: expected a valid uid");
    }
    return { uid: p.uid, email: p.email ?? emails.get(p.uid) ?? null };
  };
  const actor = party(options.actor);
  const subject = party(options.subject);
  const user_agent: string | null = options.request?.headers.get("User-Agent") ?? null;

  return {
    created_at: options.now ?? Date.now(),
    event_type: options.event_type,
    actor_uid: actor.uid,
    actor_email: actor.email,
    subject_uid: subject.uid,
    // Same account: reuse whichever address was given.
    subject_email: subject.email ?? (subject.uid !== null && subject.uid === actor.uid ? actor.email : null),
    organization_id: options.organization_id ?? null,
    client_app_id: options.client_app_id ?? null,
    ip_address: options.request ? extractClientIp(options.request) : null,
    user_agent: user_agent === null ? null : withoutNul(user_agent).slice(0, MAX_AUDIT_EVENT_USER_AGENT_LENGTH),
    details: detailsToJsonText(options.details),
  };
}

async function lookUpMissingEmails(
  db: Kysely<AuthDatabase> | Transaction<AuthDatabase>,
  options: RecordAuditEventOptions,
): Promise<ReadonlyMap<string, string>> {
  const known = new Map<string, string>();
  const parties = [options.actor, options.subject].filter((p): p is AuditEventParty => !!p);
  for (const p of parties) {
    if (typeof p.email === "string") known.set(p.uid, p.email);
  }
  const missing = [...new Set(parties.map((p) => p.uid))].filter((uid) => !known.has(uid) && isValidUuid(uid));
  if (missing.length === 0) return known;
  const rows = await db.selectFrom("users").select(["uid", "email"]).where("uid", "in", missing).execute();
  for (const row of rows) known.set(row.uid, row.email);
  return known;
}

/**
 * Records a security-relevant action in AUDIT_EVENTS, for the audit logs
 * of the user(s) and the organization it names. Call it once the action
 * succeeded (or, for `*_failed` events, was refused).
 *
 * Contract: this function MUST NOT throw. An audit log that cannot be
 * written must not fail the action it describes: the failure is captured
 * to the ERRORS table instead.
 *
 * Do not pass a transaction that may still roll back, unless the event
 * should be rolled back with it.
 */
export async function recordAuditEvent(
  db: Kysely<AuthDatabase> | Transaction<AuthDatabase>,
  options: RecordAuditEventOptions,
): Promise<void> {
  try {
    const emails = await lookUpMissingEmails(db, options);
    await insertAuditEvent(db, buildAuditEventRow(options, emails));
  } catch (e: unknown) {
    await captureServerException(db, e, {
      op_name: "recordAuditEvent",
      uid: options.actor?.uid ?? options.subject?.uid,
      context: {
        event_type: options.event_type,
        organization_id: options.organization_id ?? null,
        nonFatal: true,
      },
    });
  }
}

export default recordAuditEvent;
