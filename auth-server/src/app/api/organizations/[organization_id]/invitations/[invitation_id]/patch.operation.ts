import { z, requireAuth } from "@schemavaults/openapi-operations";
import { defineOperation } from "@/lib/api/context";
import { sessionSchemes } from "@/lib/api/auth-schemes";
import { OrganizationInvitation } from "@/lib/api/domain-schemas/organizations";
import { ErrorResponse, sessionErrorResponses, validationErrorResponse } from "@/lib/api/schemas";
import { API_TAGS } from "@/lib/api/tags";
import {
  MAXIMUM_USER_ORGANIZATIONS,
  hasUserExceededMaximumOrgMemberships,
  lookupInvitation,
  respondToInvitation,
  type RespondToInvitationResult,
} from "@/lib/auth-db/organizations";
import captureServerException from "@/lib/captureServerException";
import { sendTeamInvitationAcceptedEmail } from "@/lib/mail/send-team-invitation-emails";
import { INVITATION_ROUTE, invitationParams } from "./shared";

class ExceededMembershipLimitError extends Error {}

export const respondToOrganizationInvitation = defineOperation({
  method: "patch",
  path: INVITATION_ROUTE,
  summary: "Accept or decline an invitation",
  description:
    "Lets the invited user accept (joining the organization as a member) or decline a pending invitation. Only the invitee may respond; accepting is refused once the caller reached the membership limit.",
  tags: [API_TAGS.organizations],
  auth: requireAuth({ schemes: sessionSchemes, notes: "Only the invited user may respond to an invitation." }),
  request: {
    params: invitationParams,
    body: {
      lenientContentType: true,
      schema: z
        .object({ action: z.enum(["accept", "decline"]).openapi({ example: "accept" }) })
        .openapi("RespondToOrganizationInvitationRequest"),
    },
  },
  responses: {
    200: {
      description: "The invitation was accepted or declined",
      schema: z.object({
        success: z.literal(true),
        message: z.string(),
        data: z.object({ invitation: OrganizationInvitation.optional() }),
      }),
    },
    ...validationErrorResponse,
    ...sessionErrorResponses,
    404: { description: "No such invitation in this organization", schema: ErrorResponse },
    409: { description: "The caller reached the organization membership limit", schema: ErrorResponse },
    500: { description: "Failed to respond to the invitation", schema: ErrorResponse },
  },
  handler: async (ctx) => {
    const user = ctx.auth.user!;
    const { db, redis } = ctx.context;
    const { organization_id, invitation_id } = ctx.params;
    const { action } = ctx.body;

    // Look up the invitation first to verify it belongs to this organization
    const invitation = await lookupInvitation(db, invitation_id);
    if (!invitation) {
      return ctx.json(404, { success: false, message: "Invitation not found" });
    }
    if (invitation.organization_id !== organization_id) {
      return ctx.json(404, { success: false, message: "Invitation does not belong to this organization" });
    }

    // Only the invitee can respond to the invitation
    if (invitation.invitee_uid !== user.uid) {
      return ctx.json(403, { success: false, message: "You are not authorized to respond to this invitation" });
    }

    let result: RespondToInvitationResult;
    try {
      result = await db.transaction().execute(async (trx): Promise<RespondToInvitationResult> => {
        // Check if user has reached the maximum number of organization memberships when accepting
        if (action === "accept") {
          const exceededMembershipLimit = await hasUserExceededMaximumOrgMemberships(trx, user.uid);
          if (exceededMembershipLimit) {
            throw new ExceededMembershipLimitError();
          }
        }
        return await respondToInvitation(trx, invitation_id, user.uid, action);
      });

      if (!result.success) {
        return ctx.json(400, { success: false, message: result.message });
      }

      if (action === "accept") {
        try {
          await sendTeamInvitationAcceptedEmail({
            db,
            organization_id,
            inviter_uid: invitation.inviter_uid,
            accepter_uid: user.uid,
            redis,
          });
        } catch (emailError: unknown) {
          await captureServerException(db, emailError, {
            op_name: "PATCH_respond_to_invitation_handler.sendTeamInvitationAcceptedEmail",
            route: INVITATION_ROUTE,
            uid: user.uid,
            context: { organization_id, invitation_id, nonFatal: true },
          });
        }
      }
    } catch (e: unknown) {
      if (e instanceof ExceededMembershipLimitError) {
        return ctx.json(409, {
          success: false,
          message: `You have reached the maximum number of organization memberships (${MAXIMUM_USER_ORGANIZATIONS}). Please leave an organization before accepting this invitation.`,
        });
      }
      await captureServerException(db, e, {
        op_name: "PATCH_respond_to_invitation_handler.respondToInvitation",
        route: INVITATION_ROUTE,
        uid: user.uid,
        context: { organization_id, invitation_id, action },
      });
      return ctx.json(500, { success: false, message: "Failed to respond to invitation" });
    }

    return ctx.json(200, { success: true, message: result.message, data: { invitation: result.invitation } });
  },
});
