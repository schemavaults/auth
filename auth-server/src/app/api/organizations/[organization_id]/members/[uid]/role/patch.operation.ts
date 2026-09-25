import { isValidOrganizationMembershipRoleType } from "@schemavaults/auth-common";
import { z, requireAuth } from "@schemavaults/openapi-operations";
import { defineOperation } from "@/lib/api/context";
import { sessionSchemes } from "@/lib/api/auth-schemes";
import { OrganizationMembershipRole } from "@/lib/api/domain-schemas/organizations";
import {
  ErrorResponse,
  sessionErrorResponses,
  SuccessMessageResponse,
  validationErrorResponse,
} from "@/lib/api/schemas";
import { API_TAGS } from "@/lib/api/tags";
import { OrganizationsRegistry } from "@/lib/auth-db/organizations";
import captureServerException from "@/lib/captureServerException";
import { MEMBER_ROLE_ROUTE, memberRoleParams } from "./shared";

export const updateOrganizationMemberRole = defineOperation({
  method: "patch",
  path: MEMBER_ROLE_ROUTE,
  summary: "Change a member's role",
  description:
    "Promotes a member to `owner` or demotes an owner to `member`. Only organization owners and platform administrators may change roles; the last owner cannot be demoted, the virtual `admin` role cannot be assigned, and roles in system organizations cannot be changed.",
  tags: [API_TAGS.organizations],
  auth: requireAuth({
    schemes: sessionSchemes,
    notes: "The caller must be an owner of the organization or a platform administrator.",
  }),
  request: {
    params: memberRoleParams,
    body: {
      lenientContentType: true,
      schema: z
        .object({ role: OrganizationMembershipRole })
        .openapi("UpdateOrganizationMemberRoleRequest"),
    },
  },
  responses: {
    200: { description: "The role was updated", schema: SuccessMessageResponse },
    ...validationErrorResponse,
    ...sessionErrorResponses,
    404: { description: "The user is not a member of the organization", schema: ErrorResponse },
    500: { description: "Failed to update the role", schema: ErrorResponse },
  },
  handler: async (ctx) => {
    const user = ctx.auth.user;
    const { db } = ctx.context;
    const { organization_id, uid: target_uid } = ctx.params;
    const new_role: string = ctx.body.role;

    // Validate role
    if (!isValidOrganizationMembershipRoleType(new_role)) {
      return ctx.json(400, {
        success: false,
        message: "Invalid role provided! Must be 'owner' or 'member'.",
      });
    }

    // Cannot set role to 'admin' - that's only for virtual schemavaults memberships
    if (new_role === "admin") {
      return ctx.json(400, {
        success: false,
        message: "Cannot set role to 'admin'. Admin is a virtual role for schemavaults organization only.",
      });
    }

    const registry = new OrganizationsRegistry(db);

    // Check authorization: user must be admin OR owner of the organization
    if (!user.admin) {
      const userMemberships = await registry.listUserOrganizationMemberships(user.uid, false);
      const userMembership = userMemberships.find((m) => m.organization_id === organization_id);
      if (!userMembership || (userMembership.role !== "owner" && userMembership.role !== "admin")) {
        return ctx.json(403, {
          success: false,
          message: "You must be an organization owner/admin to change member roles!",
        });
      }
    }

    try {
      await registry.updateMemberRole(organization_id, target_uid, new_role);
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : "Failed to update member role!";

      // Check for specific error messages
      if (errorMessage.includes("last owner")) {
        return ctx.json(400, { success: false, message: "Cannot demote the last owner of an organization!" });
      }
      if (errorMessage.includes("No membership found")) {
        return ctx.json(404, { success: false, message: "User is not a member of this organization!" });
      }
      if (errorMessage.includes("hardcoded")) {
        return ctx.json(403, { success: false, message: "Cannot update member roles in system organizations!" });
      }

      await captureServerException(db, e, {
        op_name: "PATCH_member_role_handler.updateMemberRole",
        route: MEMBER_ROLE_ROUTE,
        uid: user.uid,
        context: { organization_id, target_uid, new_role },
      });
      return ctx.json(500, { success: false, message: "Failed to update member role!" });
    }

    return ctx.json(200, { success: true, message: `Successfully updated member role to '${new_role}'!` });
  },
});
