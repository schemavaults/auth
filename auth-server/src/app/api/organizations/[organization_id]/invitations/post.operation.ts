import { inviteMemberInputModes } from "@schemavaults/auth-common";
import { z, requireAuth } from "@schemavaults/openapi-operations";
import { defineOperation } from "@/lib/api/context";
import { sessionSchemes } from "@/lib/api/auth-schemes";
import { OrganizationInvitation, organizationIdParams } from "@/lib/api/domain-schemas/organizations";
import { ErrorResponse, sessionErrorResponses, validationErrorResponse } from "@/lib/api/schemas";
import { API_TAGS } from "@/lib/api/tags";
import {
  OrganizationsRegistry,
  createOrganizationInvitation,
  listOrganizationInvitations,
} from "@/lib/auth-db/organizations";
import { getUserByEmail, getUserByUID } from "@/lib/auth-db/users";
import captureServerException from "@/lib/captureServerException";
import { sendTeamInvitationEmail } from "@/lib/mail/send-team-invitation-emails";
import { INVITATIONS_ROUTE, isOrganizationOwnerOrPlatformAdmin } from "./shared";

// Schema for invitation request body (organization_id comes from URL)
const CreateOrganizationInvitationRequest = z
  .object({
    input_mode: z.enum(inviteMemberInputModes).openapi({
      description: "How `identifier` names the invitee: by e-mail address or by user id",
      example: "email",
    }),
    identifier: z.string().min(1).openapi({
      description: "The invitee's e-mail address (`input_mode: email`) or user id (`input_mode: uid`)",
      example: "teammate@example.com",
    }),
  })
  .refine(
    (data) => {
      if (data.input_mode === "uid") {
        return z.guid().safeParse(data.identifier).success;
      } else if (data.input_mode === "email") {
        return z.email().safeParse(data.identifier).success;
      }
      return false;
    },
    { message: "Invalid identifier format for the selected input mode", path: ["identifier"] },
  )
  .openapi("CreateOrganizationInvitationRequest");

export const createOrganizationInvitationOperation = defineOperation({
  method: "post",
  path: INVITATIONS_ROUTE,
  summary: "Invite a user to an organization",
  description:
    "Creates a pending invitation for an existing user (looked up by e-mail address or user id) and e-mails them. Organization owners and platform administrators only. Refused when the user is already a member or already has a pending invitation.",
  tags: [API_TAGS.organizations],
  auth: requireAuth({
    schemes: sessionSchemes,
    notes: "Only organization owners or platform administrators may invite members.",
  }),
  request: {
    params: organizationIdParams,
    body: { lenientContentType: true, schema: CreateOrganizationInvitationRequest },
  },
  responses: {
    201: {
      description: "The invitation was created",
      schema: z.object({
        success: z.literal(true),
        message: z.string(),
        data: z.object({ invitation: OrganizationInvitation }),
      }),
    },
    ...validationErrorResponse,
    ...sessionErrorResponses,
    404: { description: "No user matches the identifier", schema: ErrorResponse },
    409: {
      description: "The user is already a member, or already has a pending invitation",
      schema: ErrorResponse,
    },
    500: { description: "Failed to create the invitation", schema: ErrorResponse },
  },
  handler: async (ctx) => {
    const user = ctx.auth.user!;
    const { db, redis } = ctx.context;
    const { organization_id } = ctx.params;
    const { input_mode, identifier } = ctx.body;

    // Check access: user must be admin OR owner of the organization
    if (!(await isOrganizationOwnerOrPlatformAdmin(db, user, organization_id))) {
      return ctx.json(403, { success: false, message: "Only organization owners can invite members" });
    }

    // Look up the invitee
    let invitee_uid: string;
    try {
      if (input_mode === "email") {
        const invitee = await getUserByEmail(db, identifier);
        if (!invitee) {
          return ctx.json(404, { success: false, message: "No user found with that email address" });
        }
        invitee_uid = invitee.uid;
      } else {
        const invitee = await getUserByUID(db, identifier);
        if (!invitee) {
          return ctx.json(404, { success: false, message: "No user found with that ID" });
        }
        invitee_uid = invitee.uid;
      }
    } catch (e: unknown) {
      await captureServerException(db, e, {
        op_name: "POST_create_invitation_handler.lookupInvitee",
        route: INVITATIONS_ROUTE,
        uid: user.uid,
        context: { organization_id, input_mode },
      });
      return ctx.json(500, { success: false, message: "Failed to lookup user" });
    }

    // Check if user is already a member
    const registry = new OrganizationsRegistry(db);
    const inviteeMemberships = await registry.listUserOrganizationMembershipIds(invitee_uid, false);
    if (inviteeMemberships.includes(organization_id)) {
      return ctx.json(409, { success: false, message: "User is already a member of this organization" });
    }

    // Check if there's already a pending invitation
    const existingInvitations = await listOrganizationInvitations(db, organization_id, { status: "pending" });
    const existingInvitation = existingInvitations.find((inv) => inv.invitee_uid === invitee_uid);
    if (existingInvitation) {
      return ctx.json(409, { success: false, message: "There is already a pending invitation for this user" });
    }

    // Create the invitation
    try {
      const invitation = await createOrganizationInvitation(db, {
        organization_id,
        inviter_uid: user.uid,
        invitee_uid,
      });

      try {
        await sendTeamInvitationEmail({ db, redis, organization_id, inviter_uid: user.uid, invitee_uid });
      } catch (emailError: unknown) {
        await captureServerException(db, emailError, {
          op_name: "POST_create_invitation_handler.sendTeamInvitationEmail",
          route: INVITATIONS_ROUTE,
          uid: user.uid,
          context: { organization_id, invitee_uid, nonFatal: true },
        });
      }

      return ctx.json(201, { success: true, message: "Invitation created successfully", data: { invitation } });
    } catch (e: unknown) {
      await captureServerException(db, e, {
        op_name: "POST_create_invitation_handler.createOrganizationInvitation",
        route: INVITATIONS_ROUTE,
        uid: user.uid,
        context: { organization_id, invitee_uid },
      });
      return ctx.json(500, { success: false, message: "Failed to create invitation" });
    }
  },
});
