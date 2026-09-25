import { organizationIdSchema } from "@schemavaults/auth-common";
import { z, requireAuth } from "@schemavaults/openapi-operations";
import { defineOperation } from "@/lib/api/context";
import { sessionSchemes } from "@/lib/api/auth-schemes";
import { OrganizationMembershipRole, organizationIdParams } from "@/lib/api/domain-schemas/organizations";
import { ErrorResponse, sessionErrorResponses, validationErrorResponse } from "@/lib/api/schemas";
import { API_TAGS } from "@/lib/api/tags";
import { listUserOrganizationMemberships } from "@/lib/auth-db/organizations";
import captureServerException from "@/lib/captureServerException";

const ROUTE = "/api/me/organizations/{organization_id}/role";

export const getMyOrganizationRole = defineOperation({
  method: "get",
  path: ROUTE,
  summary: "Get my role in an organization",
  description:
    "Returns the caller's membership role in one organization; 404 when the caller is not a member (platform administrators hold the virtual `admin` role in the owner organization).",
  tags: [API_TAGS.account],
  auth: requireAuth({ schemes: sessionSchemes }),
  request: { params: organizationIdParams },
  responses: {
    200: {
      description: "The caller's role",
      schema: z.object({
        success: z.literal(true),
        message: z.string(),
        data: z.object({ organization_id: organizationIdSchema, role: OrganizationMembershipRole }),
      }),
    },
    ...validationErrorResponse,
    ...sessionErrorResponses,
    404: { description: "The caller is not a member of the organization", schema: ErrorResponse },
    500: { description: "Failed to look up the membership", schema: ErrorResponse },
  },
  handler: async (ctx) => {
    const user = ctx.auth.user;
    const { db } = ctx.context;
    const { organization_id } = ctx.params;
    try {
      const admin: boolean = user.admin ?? false;
      const memberships = await listUserOrganizationMemberships(db, user.uid, admin);
      const membership = memberships.find((m) => m.organization_id === organization_id);
      if (!membership) {
        return ctx.json(404, { success: false, message: "User is not a member of this organization" });
      }
      return ctx.json(200, {
        success: true,
        message: "Successfully retrieved user role in organization",
        data: { organization_id: membership.organization_id, role: membership.role },
      });
    } catch (e: unknown) {
      await captureServerException(db, e, {
        op_name: "GET_my_organization_role_handler.listUserOrganizationMemberships",
        route: ROUTE,
        uid: user.uid,
      });
      return ctx.json(500, { success: false, message: "Failed to get user organization role" });
    }
  },
});
