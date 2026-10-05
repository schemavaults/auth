import {
  assignableOrganizationMembershipRoles,
  getHardcodedOrgs,
  inviteMemberInputModes,
  MAXIMUM_USER_ORGANIZATIONS,
} from "@schemavaults/auth-common";
import { z, requireAuth } from "@schemavaults/openapi-operations";
import { defineOperation } from "@/lib/api/context";
import { sessionSchemes } from "@/lib/api/auth-schemes";
import { OrganizationMember, organizationIdParams } from "@/lib/api/domain-schemas/organizations";
import { adminErrorResponses, ErrorResponse, validationErrorResponse } from "@/lib/api/schemas";
import { API_TAGS } from "@/lib/api/tags";
import {
  AlreadyOrganizationMemberError,
  AssignedUserNotFoundError,
  OrganizationMembershipLimitReachedError,
  assignOrganizationMembership,
  type AssignOrganizationMembershipResult,
} from "@/lib/auth-db/organizations";
import { getUserByEmail, getUserByUID, type UserDocument } from "@/lib/auth-db/users";
import captureServerException from "@/lib/captureServerException";
import { MEMBERS_ROUTE } from "./shared";

const AssignOrganizationMemberRequest = z
  .object({
    input_mode: z.enum(inviteMemberInputModes).openapi({
      description: "How `identifier` names the user: by e-mail address or by user id",
      example: "email",
    }),
    identifier: z.string().min(1).openapi({
      description: "The user's e-mail address (`input_mode: email`) or user id (`input_mode: uid`)",
      example: "teammate@example.com",
    }),
    role: z.enum(assignableOrganizationMembershipRoles).default("member").openapi({
      description:
        "Role of the new membership (default `member`). The virtual `admin` role cannot be assigned.",
      example: "member",
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
  .openapi("AssignOrganizationMemberRequest");

export const assignOrganizationMember = defineOperation({
  method: "post",
  path: MEMBERS_ROUTE,
  summary: "Add a member directly (administrators)",
  description:
    "Makes an existing user (looked up by e-mail address or user id, the caller included) a member of the organization immediately, without an invitation to accept. Platform administrators only: organization owners invite members with `POST /api/organizations/{organization_id}/invitations`. Any pending invitation of the user to the organization is revoked. Refused for system organizations, service accounts (an organization-owned app's service account joins its organization through `PUT /api/apps/{app_id}/service-account/organization-membership` instead), users that already are members and users at the membership limit.",
  tags: [API_TAGS.organizations],
  auth: requireAuth({
    schemes: sessionSchemes,
    routeGuard: "admin",
    notes: "Only platform administrators may add members directly; organization owners must invite.",
  }),
  request: {
    params: organizationIdParams,
    body: { lenientContentType: true, schema: AssignOrganizationMemberRequest },
  },
  responses: {
    201: {
      description: "The user is now a member of the organization",
      schema: z.object({
        success: z.literal(true),
        message: z.string(),
        data: z.object({
          member: OrganizationMember,
          revoked_invitation_ids: z.array(z.guid()).readonly().openapi({
            description: "Pending invitations of the user to the organization that the membership superseded",
          }),
        }),
      }),
    },
    ...validationErrorResponse,
    401: adminErrorResponses[401],
    403: {
      description: "The caller is not a platform administrator, or the organization is a system organization",
      schema: ErrorResponse,
    },
    404: { description: "No such organization, or no user matches the identifier", schema: ErrorResponse },
    409: {
      description: "The user already is a member, or reached the organization membership limit",
      schema: ErrorResponse,
    },
    500: { description: "Failed to add the member", schema: ErrorResponse },
  },
  handler: async (ctx) => {
    const user = ctx.auth.user;
    const { db } = ctx.context;
    const { organization_id } = ctx.params;
    const { input_mode, identifier, role } = ctx.body;

    // Membership of system organizations follows the platform admin flag
    if (getHardcodedOrgs().some((org) => org.organization_id === organization_id)) {
      return ctx.json(403, { success: false, message: "Cannot add members to a system organization!" });
    }

    let assignee: UserDocument | null;
    try {
      const organization = await db
        .selectFrom("organizations")
        .where("organization_id", "=", organization_id)
        .select("organization_id")
        .executeTakeFirst();
      if (!organization) {
        return ctx.json(404, { success: false, message: "Organization not found" });
      }
      assignee =
        input_mode === "email" ? await getUserByEmail(db, identifier) : await getUserByUID(db, identifier);
    } catch (e: unknown) {
      await captureServerException(db, e, {
        op_name: "POST_assign_organization_member_handler.lookup",
        route: MEMBERS_ROUTE,
        uid: user.uid,
        context: { organization_id, input_mode },
      });
      return ctx.json(500, { success: false, message: "Failed to look up the organization or user" });
    }
    if (!assignee) {
      return ctx.json(404, {
        success: false,
        message: input_mode === "email" ? "No user found with that email address" : "No user found with that ID",
      });
    }
    if (assignee.service_account_app_id) {
      return ctx.json(400, {
        success: false,
        message:
          "Service accounts cannot be added to an organization directly. The service account of an organization-owned app joins its organization through the app's service account settings (PUT /api/apps/{app_id}/service-account/organization-membership).",
      });
    }
    const assignee_uid: string = assignee.uid;

    let result: AssignOrganizationMembershipResult;
    try {
      result = await db
        .transaction()
        .execute((trx) => assignOrganizationMembership(trx, { organization_id, uid: assignee_uid, role }));
    } catch (e: unknown) {
      if (e instanceof AlreadyOrganizationMemberError) {
        return ctx.json(409, { success: false, message: "User is already a member of this organization" });
      }
      if (e instanceof OrganizationMembershipLimitReachedError) {
        return ctx.json(409, {
          success: false,
          message: `The user has reached the maximum number of organization memberships (${MAXIMUM_USER_ORGANIZATIONS}).`,
        });
      }
      if (e instanceof AssignedUserNotFoundError) {
        return ctx.json(404, { success: false, message: "No user found with that ID" });
      }
      await captureServerException(db, e, {
        op_name: "POST_assign_organization_member_handler.assignOrganizationMembership",
        route: MEMBERS_ROUTE,
        uid: user.uid,
        context: { organization_id, assignee_uid, role },
      });
      return ctx.json(500, { success: false, message: "Failed to add the member" });
    }

    const { membership, revoked_invitation_ids } = result;
    return ctx.json(201, {
      success: true,
      message: `Added ${assignee.email} to the organization as ${role}`,
      data: {
        member: {
          membership_declaration_id: membership.membership_declaration_id,
          organization_id: membership.organization_id,
          uid: membership.uid,
          role: membership.role,
          membership_created_at: membership.created_at,
          email: assignee.email,
          email_verified: assignee.email_verified,
          admin: assignee.admin ?? undefined,
          disabled: assignee.disabled ?? undefined,
        },
        revoked_invitation_ids,
      },
    });
  },
});
