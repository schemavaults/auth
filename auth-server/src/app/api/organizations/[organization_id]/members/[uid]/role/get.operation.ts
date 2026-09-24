import { z, requireAuth } from "@schemavaults/openapi-operations";
import { defineOperation } from "@/lib/api/context";
import { sessionSchemes } from "@/lib/api/auth-schemes";
import { OrganizationMembershipRole } from "@/lib/api/domain-schemas/organizations";
import { ErrorResponse, sessionErrorResponses, validationErrorResponse } from "@/lib/api/schemas";
import { API_TAGS } from "@/lib/api/tags";
import { OrganizationsRegistry } from "@/lib/auth-db/organizations";
import { MEMBER_ROLE_ROUTE, memberRoleParams } from "./shared";

export const getOrganizationMemberRole = defineOperation({
  method: "get",
  path: MEMBER_ROLE_ROUTE,
  summary: "Get a member's role",
  description:
    "Returns the role one user holds in the organization. Members of the organization and platform administrators may call it.",
  tags: [API_TAGS.organizations],
  auth: requireAuth({
    schemes: sessionSchemes,
    notes: "The caller must be a member of the organization or a platform administrator.",
  }),
  request: { params: memberRoleParams },
  responses: {
    200: {
      description: "The member's role",
      schema: z.object({
        success: z.literal(true),
        message: z.string(),
        data: z.object({ role: OrganizationMembershipRole }),
      }),
    },
    ...validationErrorResponse,
    ...sessionErrorResponses,
    404: { description: "The user is not a member of the organization", schema: ErrorResponse },
  },
  handler: async (ctx) => {
    const user = ctx.auth.user!;
    const { db } = ctx.context;
    const { organization_id, uid: target_uid } = ctx.params;

    const registry = new OrganizationsRegistry(db);

    // Check authorization: user must be admin OR a member of the organization
    if (!user.admin) {
      const userMembershipIds = await registry.listUserOrganizationMembershipIds(user.uid, user.admin ?? false);
      const isMember = userMembershipIds.includes(organization_id);
      if (!isMember) {
        return ctx.json(403, {
          success: false,
          message: "You do not have permission to view this organization's member roles!",
        });
      }
    }

    // Look up the target user's membership in this organization
    const targetMemberships = await registry.listUserOrganizationMemberships(target_uid, false);
    const targetMembership = targetMemberships.find((m) => m.organization_id === organization_id);
    if (!targetMembership) {
      return ctx.json(404, { success: false, message: "User is not a member of this organization!" });
    }

    return ctx.json(200, {
      success: true,
      message: "Successfully retrieved member role!",
      data: { role: targetMembership.role },
    });
  },
});
