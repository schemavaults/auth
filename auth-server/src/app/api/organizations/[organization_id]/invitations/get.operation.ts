import { z, requireAuth } from "@schemavaults/openapi-operations";
import { defineOperation } from "@/lib/api/context";
import { sessionSchemes } from "@/lib/api/auth-schemes";
import { OrganizationInvitationListEntry, organizationIdParams } from "@/lib/api/domain-schemas/organizations";
import { ErrorResponse, sessionErrorResponses, validationErrorResponse } from "@/lib/api/schemas";
import { API_TAGS } from "@/lib/api/tags";
import { listOrganizationInvitations } from "@/lib/auth-db/organizations";
import captureServerException from "@/lib/captureServerException";
import { INVITATIONS_ROUTE, isOrganizationOwnerOrPlatformAdmin } from "./shared";

export const listOrganizationInvitationsOperation = defineOperation({
  method: "get",
  path: INVITATIONS_ROUTE,
  summary: "List an organization's invitations",
  description:
    "Lists every invitation of the organization (pending, accepted, declined, revoked and expired) with the inviter's and invitee's e-mail addresses. Organization owners and platform administrators only.",
  tags: [API_TAGS.organizations],
  auth: requireAuth({
    schemes: sessionSchemes,
    notes: "Only organization owners or platform administrators may list invitations.",
  }),
  request: { params: organizationIdParams },
  responses: {
    200: {
      description: "The organization's invitations",
      schema: z.object({
        success: z.literal(true),
        message: z.string(),
        data: z.object({ invitations: z.array(OrganizationInvitationListEntry).readonly() }),
      }),
    },
    ...validationErrorResponse,
    ...sessionErrorResponses,
    500: { description: "Failed to list the invitations", schema: ErrorResponse },
  },
  handler: async (ctx) => {
    const user = ctx.auth.user;
    const { db } = ctx.context;
    const { organization_id } = ctx.params;

    // Check access: user must be admin OR owner of the organization
    if (!(await isOrganizationOwnerOrPlatformAdmin(db, user, organization_id))) {
      return ctx.json(403, { success: false, message: "Only organization owners can view invitations" });
    }

    try {
      const invitations = await listOrganizationInvitations(db, organization_id);
      return ctx.json(200, {
        success: true,
        message: "Successfully listed organization invitations",
        data: { invitations },
      });
    } catch (e: unknown) {
      await captureServerException(db, e, {
        op_name: "GET_list_invitations_handler.listOrganizationInvitations",
        route: INVITATIONS_ROUTE,
        uid: user.uid,
        context: { organization_id },
      });
      return ctx.json(500, { success: false, message: "Failed to list invitations" });
    }
  },
});
