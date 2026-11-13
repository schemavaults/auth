import { z } from "zod";
import { auditEventTypes } from "./event-types";

/**
 * An audit log entry as the API returns it (client-safe: the audit log
 * components parse responses with it).
 */
const auditLogPartySchema = z.object({
  /** Null once the account was deleted. */
  uid: z.string().nullable(),
  /** The account's e-mail address when the event happened. */
  email: z.string().nullable(),
});

export const auditLogEntrySchema = z.object({
  audit_event_id: z.string(),
  /** When the event happened (Unix epoch ms). */
  created_at: z.number(),
  event_type: z.enum(auditEventTypes),
  /** Who did it; null when nobody was signed in, or the server did it. */
  actor: auditLogPartySchema.nullable(),
  /** The account the event is about; null when it is about no account. */
  subject: auditLogPartySchema.nullable(),
  organization_id: z.string().nullable(),
  client_app_id: z.string().nullable(),
  /** Only returned to the user whose request it was (see toAuditLogEntry). */
  ip_address: z.string().nullable(),
  user_agent: z.string().nullable(),
  details: z.record(z.string(), z.unknown()).nullable(),
});

export type AuditLogEntry = z.infer<typeof auditLogEntrySchema>;
export type AuditLogParty = z.infer<typeof auditLogPartySchema>;

export const auditLogPageSchema = z.object({
  entries: z.array(auditLogEntrySchema),
  /** Pass as `cursor` to get the next (older) page; null on the last page. */
  next_cursor: z.string().nullable(),
});

export type AuditLogPage = z.infer<typeof auditLogPageSchema>;
