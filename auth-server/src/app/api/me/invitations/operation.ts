import { organizationInvitationStatusSchema } from "@schemavaults/auth-common";
import { z, requireAuth } from "@schemavaults/openapi-operations";
import { defineOperation } from "@/lib/api/context";
import { sessionSchemes } from "@/lib/api/auth-schemes";
import { ErrorResponse, sessionErrorResponses } from "@/lib/api/schemas";
import { API_TAGS } from "@/lib/api/tags";
import { listUserPendingInvitations } from "@/lib/auth-db/organizations";
import captureServerException from "@/lib/captureServerException";

export const UserPendingInvitation = z
  .object({
    invitation_id: z.guid(),
    organization_id: z.string(),
    organization_name: z.string(),
    inviter_uid: z.string(),
    inviter_email: z.string(),
    status: organizationInvitationStatusSchema,
    created_at: z.number(),
    expires_at: z.number(),
  })
  .openapi("UserPendingInvitation");

export const listMyInvitations = defineOperation({
  method: "get",
  path: "/api/me/invitations",
  summary: "List my pending organization invitations",
  tags: [API_TAGS.account],
  auth: requireAuth({ schemes: sessionSchemes }),
  responses: {
    200: {
      description: "The caller's pending invitations",
      schema: z.object({
        success: z.literal(true),
        message: z.string(),
        data: z.object({ invitations: z.array(UserPendingInvitation).readonly() }),
      }),
    },
    ...sessionErrorResponses,
    500: { description: "Failed to list invitations", schema: ErrorResponse },
  },
  handler: async (ctx) => {
    const { user } = ctx.auth;
    const { db } = ctx.context;
    try {
      const invitations = await listUserPendingInvitations(db, user!.uid);
      return ctx.json(200, {
        success: true,
        message: "Successfully listed pending invitations",
        data: { invitations },
      });
    } catch (e: unknown) {
      await captureServerException(db, e, {
        op_name: "GET_user_invitations_handler.listUserPendingInvitations",
        route: "/api/me/invitations",
        uid: user!.uid,
      });
      return ctx.json(500, { success: false, message: "Failed to list pending invitations" });
    }
  },
});
