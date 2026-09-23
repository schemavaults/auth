import { z, requireAuth } from "@schemavaults/openapi-operations";
import { defineOperation } from "@/lib/api/context";
import { sessionSchemes } from "@/lib/api/auth-schemes";
import { OrganizationMember, organizationIdParams } from "@/lib/api/domain-schemas/organizations";
import { ErrorResponse, sessionErrorResponses, validationErrorResponse } from "@/lib/api/schemas";
import { API_TAGS } from "@/lib/api/tags";
import { OrganizationsRegistry, type OrganizationMemberWithUserData } from "@/lib/auth-db/organizations";
import captureServerException from "@/lib/captureServerException";

const ROUTE = "/api/organizations/{organization_id}/members";

export const listOrganizationMembers = defineOperation({
  method: "get",
  path: ROUTE,
  summary: "List an organization's members",
  description:
    "Lists every member of the organization with their role and account data. Members of the organization and platform administrators may call it.",
  tags: [API_TAGS.organizations],
  auth: requireAuth({
    schemes: sessionSchemes,
    notes: "The caller must be a member of the organization or a platform administrator.",
  }),
  request: { params: organizationIdParams },
  responses: {
    200: {
      description: "The organization's members",
      schema: z.object({
        success: z.literal(true),
        message: z.string(),
        data: z.object({ members: z.array(OrganizationMember).readonly() }),
      }),
    },
    ...validationErrorResponse,
    ...sessionErrorResponses,
    500: { description: "Failed to list the members", schema: ErrorResponse },
  },
  handler: async (ctx) => {
    const user = ctx.auth.user!;
    const { db } = ctx.context;
    const { organization_id } = ctx.params;

    const registry = new OrganizationsRegistry(db);

    // Check access: user must be admin OR member of the organization
    if (!user.admin) {
      const userMembershipIds = await registry.listUserOrganizationMembershipIds(user.uid, user.admin ?? false);
      const isMember = userMembershipIds.includes(organization_id);
      if (!isMember) {
        return ctx.json(403, {
          success: false,
          message: "You do not have permission to view this organization's members!",
        });
      }
    }

    let members: readonly OrganizationMemberWithUserData[];
    try {
      members = await registry.listOrganizationMembers(organization_id);
    } catch (e: unknown) {
      await captureServerException(db, e, {
        op_name: "GET_organization_members_handler.listOrganizationMembers",
        route: ROUTE,
        uid: user.uid,
        context: { organization_id },
      });
      return ctx.json(500, { success: false, message: "Failed to list organization members!" });
    }

    return ctx.json(200, {
      success: true,
      message: "Successfully listed organization members!",
      data: { members },
    });
  },
});
