import { z, withOpenApi } from "@schemavaults/openapi-operations";
import { auditLogEntrySchema } from "@/lib/audit-log/audit-log-entry-schema";
import {
  auditEventTypes,
  DEFAULT_AUDIT_LOG_PAGE_SIZE,
  MAX_AUDIT_LOG_PAGE_SIZE,
} from "@/lib/audit-log/event-types";

/** Schemas shared by the two audit log operations (the user's and the organization's). */

export const AuditLogEntry = withOpenApi(auditLogEntrySchema, "AuditLogEntry", {
  description:
    "A recorded security-relevant action: what happened (`event_type`), who did it (`actor`; null when nobody was signed in or the server did it), which account it was about (`subject`), the organization and client application involved, and event-specific `details`. `ip_address` and `user_agent` describe the request behind the event and are only returned to the user who made it, in their own log (also on failed sign-ins to their account); an organization's log never carries them.",
});

export const ListAuditLogResponse = z
  .object({
    success: z.literal(true),
    data: z.object({
      entries: z.array(AuditLogEntry),
      next_cursor: z.string().nullable().openapi({
        description: "Pass as `cursor` to get the next (older) page; null on the last page.",
      }),
    }),
  })
  .openapi("ListAuditLogResponse");

export const auditLogQuery = z.object({
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_AUDIT_LOG_PAGE_SIZE)
    .optional()
    .openapi({
      description: `Page size (default ${DEFAULT_AUDIT_LOG_PAGE_SIZE}, at most ${MAX_AUDIT_LOG_PAGE_SIZE}).`,
      example: DEFAULT_AUDIT_LOG_PAGE_SIZE,
    }),
  cursor: z.string().max(100).optional().openapi({
    description: "`next_cursor` of the previous page: lists the events older than that page.",
  }),
  event_type: z.enum(auditEventTypes).optional().openapi({
    description: "Only list events of this type.",
    example: "user.signed_in",
  }),
});
