import { requireAuth } from "@schemavaults/openapi-operations";
import { defineOperation } from "@/lib/api/context";
import { sessionSchemes } from "@/lib/api/auth-schemes";
import { auditLogQuery, ListAuditLogResponse } from "@/lib/api/domain-schemas/audit-log";
import { organizationIdParams } from "@/lib/api/domain-schemas/organizations";
import { ErrorResponse, sessionErrorResponses, validationErrorResponse } from "@/lib/api/schemas";
import { API_TAGS } from "@/lib/api/tags";
import { DEFAULT_AUDIT_LOG_PAGE_SIZE } from "@/lib/audit-log/event-types";
import { parseAuditLogCursor, toAuditLogPage } from "@/lib/audit-log/to-audit-log-entry";
import { listAuditEventsForOrganization } from "@/lib/auth-db/audit-events";
import captureServerException from "@/lib/captureServerException";
import { isOrganizationOwnerOrPlatformAdmin } from "../invitations/shared";

const ROUTE = "/api/organizations/{organization_id}/audit-log";

export const listOrganizationAuditLog = defineOperation({
  method: "get",
  path: ROUTE,
  summary: "List an organization's audit log",
  description:
    "Lists the organization's recorded events, newest first: invitations sent, revoked, accepted and declined, members added and removed, role changes, and changes to its MFA requirement, each with who did it and who it was about. Paginated with `cursor`. Only organization owners and platform administrators may call it. Entries never carry `ip_address` or `user_agent`. An organization created with the id of a deleted one does not see its predecessor's events.",
  tags: [API_TAGS.organizations],
  auth: requireAuth({
    schemes: sessionSchemes,
    notes: "Only organization owners or platform administrators may read the audit log.",
  }),
  request: { params: organizationIdParams, query: auditLogQuery },
  responses: {
    200: { description: "One page of the organization's audit log", schema: ListAuditLogResponse },
    ...validationErrorResponse,
    401: sessionErrorResponses[401],
    403: {
      description:
        "The account is disabled, or the caller is neither an owner of the organization nor a platform administrator",
      schema: ErrorResponse,
    },
    500: { description: "Failed to list the audit log", schema: ErrorResponse },
  },
  handler: async (ctx) => {
    const user = ctx.auth.user;
    const { db } = ctx.context;
    const { organization_id } = ctx.params;
    const { limit, cursor, event_type } = ctx.query;

    const after = cursor === undefined ? undefined : parseAuditLogCursor(cursor);
    if (after === null) {
      return ctx.json(400, { success: false, message: "Invalid cursor" });
    }
    try {
      // The same answer whether or not the organization exists, so the
      // endpoint does not reveal which organization ids are taken.
      if (!(await isOrganizationOwnerOrPlatformAdmin(db, user, organization_id))) {
        return ctx.json(403, {
          success: false,
          message: "Only organization owners or platform administrators can view the audit log",
        });
      }
      const page = await listAuditEventsForOrganization(db, organization_id, {
        limit: limit ?? DEFAULT_AUDIT_LOG_PAGE_SIZE,
        after,
        event_type,
      });
      return ctx.json(200, { success: true, data: toAuditLogPage(page, { kind: "organization" }) });
    } catch (e: unknown) {
      await captureServerException(db, e, {
        op_name: "GET_list_organization_audit_log",
        route: ROUTE,
        uid: user.uid,
        context: { organization_id },
      });
      return ctx.json(500, { success: false, message: "Failed to list the organization's audit log" });
    }
  },
});
