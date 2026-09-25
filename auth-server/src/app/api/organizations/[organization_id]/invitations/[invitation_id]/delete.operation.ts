import { z, requireAuth } from "@schemavaults/openapi-operations";
import { defineOperation } from "@/lib/api/context";
import { sessionSchemes } from "@/lib/api/auth-schemes";
import { OrganizationInvitation } from "@/lib/api/domain-schemas/organizations";
import { ErrorResponse, sessionErrorResponses, validationErrorResponse } from "@/lib/api/schemas";
import { API_TAGS } from "@/lib/api/tags";
import { lookupInvitation, revokeInvitation } from "@/lib/auth-db/organizations";
import captureServerException from "@/lib/captureServerException";
import { INVITATION_ROUTE, invitationParams, isOrganizationOwnerOrPlatformAdmin } from "./shared";

export const revokeOrganizationInvitation = defineOperation({
  method: "delete",
  path: INVITATION_ROUTE,
  summary: "Revoke an invitation",
  description:
    "Revokes a pending invitation so it can no longer be accepted. Organization owners and platform administrators only; invitations that are no longer pending cannot be revoked.",
  tags: [API_TAGS.organizations],
  auth: requireAuth({
    schemes: sessionSchemes,
    notes: "Only organization owners or platform administrators may revoke invitations.",
  }),
  request: { params: invitationParams },
  responses: {
    200: {
      description: "The invitation was revoked",
      schema: z.object({
        success: z.literal(true),
        message: z.string(),
        data: z.object({ invitation: OrganizationInvitation.optional() }),
      }),
    },
    ...validationErrorResponse,
    ...sessionErrorResponses,
    404: { description: "No such invitation in this organization", schema: ErrorResponse },
    500: { description: "Failed to revoke the invitation", schema: ErrorResponse },
  },
  handler: async (ctx) => {
    const user = ctx.auth.user;
    const { db } = ctx.context;
    const { organization_id, invitation_id } = ctx.params;

    // Check access: user must be admin OR owner of the organization
    if (!(await isOrganizationOwnerOrPlatformAdmin(db, user, organization_id))) {
      return ctx.json(403, { success: false, message: "Only organization owners can revoke invitations" });
    }

    // Look up the invitation first to verify it belongs to this organization
    const invitation = await lookupInvitation(db, invitation_id);
    if (!invitation) {
      return ctx.json(404, { success: false, message: "Invitation not found" });
    }
    if (invitation.organization_id !== organization_id) {
      return ctx.json(404, { success: false, message: "Invitation does not belong to this organization" });
    }

    try {
      const result = await revokeInvitation(db, invitation_id, user.uid);
      if (!result.success) {
        return ctx.json(400, { success: false, message: result.message });
      }
      return ctx.json(200, { success: true, message: result.message, data: { invitation: result.invitation } });
    } catch (e: unknown) {
      await captureServerException(db, e, {
        op_name: "DELETE_revoke_invitation_handler.revokeInvitation",
        route: INVITATION_ROUTE,
        uid: user.uid,
        context: { organization_id, invitation_id },
      });
      return ctx.json(500, { success: false, message: "Failed to revoke invitation" });
    }
  },
});
