import { requireAuth } from "@schemavaults/openapi-operations";
import { defineOperation } from "@/lib/api/context";
import { sessionSchemes } from "@/lib/api/auth-schemes";
import { auditLogQuery, ListAuditLogResponse } from "@/lib/api/domain-schemas/audit-log";
import { ErrorResponse, sessionErrorResponses, validationErrorResponse } from "@/lib/api/schemas";
import { API_TAGS } from "@/lib/api/tags";
import { DEFAULT_AUDIT_LOG_PAGE_SIZE } from "@/lib/audit-log/event-types";
import { parseAuditLogCursor, toAuditLogPage } from "@/lib/audit-log/to-audit-log-entry";
import { listAuditEventsForUser } from "@/lib/auth-db/audit-events";
import captureServerException from "@/lib/captureServerException";

const ROUTE = "/api/me/audit-log";

export const listMyAuditLog = defineOperation({
  method: "get",
  path: ROUTE,
  summary: "List my audit log",
  description:
    "Lists the security-relevant events of the caller's account, newest first: sign-ins (and failed attempts), password resets, MFA changes, applications they authorized, what administrators did to the account, and what the caller did in their organizations. Paginated with `cursor`. `ip_address` and `user_agent` are returned for the caller's own requests and for failed sign-ins to their account, never for another user's request.",
  tags: [API_TAGS.account],
  auth: requireAuth({ schemes: sessionSchemes }),
  request: { query: auditLogQuery },
  responses: {
    200: { description: "One page of the caller's audit log", schema: ListAuditLogResponse },
    ...validationErrorResponse,
    ...sessionErrorResponses,
    500: { description: "Failed to list the audit log", schema: ErrorResponse },
  },
  handler: async (ctx) => {
    const user = ctx.auth.user;
    const { db } = ctx.context;
    const { limit, cursor, event_type } = ctx.query;

    const after = cursor === undefined ? undefined : parseAuditLogCursor(cursor);
    if (after === null) {
      return ctx.json(400, { success: false, message: "Invalid cursor" });
    }
    try {
      const page = await listAuditEventsForUser(db, user.uid, {
        limit: limit ?? DEFAULT_AUDIT_LOG_PAGE_SIZE,
        after,
        event_type,
      });
      return ctx.json(200, { success: true, data: toAuditLogPage(page, { kind: "user", uid: user.uid }) });
    } catch (e: unknown) {
      await captureServerException(db, e, { op_name: "GET_list_my_audit_log", route: ROUTE, uid: user.uid });
      return ctx.json(500, { success: false, message: "Failed to list your audit log" });
    }
  },
});
