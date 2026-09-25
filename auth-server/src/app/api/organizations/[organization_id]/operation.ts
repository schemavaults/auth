import { getHardcodedOrgs } from "@schemavaults/auth-common";
import { requireAuth } from "@schemavaults/openapi-operations";
import { defineOperation } from "@/lib/api/context";
import { sessionSchemes } from "@/lib/api/auth-schemes";
import { organizationIdParams } from "@/lib/api/domain-schemas/organizations";
import {
  ErrorResponse,
  sessionErrorResponses,
  SuccessMessageResponse,
  validationErrorResponse,
} from "@/lib/api/schemas";
import { API_TAGS } from "@/lib/api/tags";
import { OrganizationsRegistry } from "@/lib/auth-db/organizations";
import captureServerException from "@/lib/captureServerException";

const ROUTE = "/api/organizations/{organization_id}";

export const deleteOrganization = defineOperation({
  method: "delete",
  path: ROUTE,
  summary: "Delete an organization",
  description:
    "Deletes an organization together with its memberships and invitations. Only owners of the organization or platform administrators may delete it; system (hardcoded) organizations cannot be deleted.",
  tags: [API_TAGS.organizations],
  auth: requireAuth({
    schemes: sessionSchemes,
    notes: "Only organization owners or platform administrators may delete an organization.",
  }),
  request: { params: organizationIdParams },
  responses: {
    200: { description: "The organization was deleted", schema: SuccessMessageResponse },
    ...validationErrorResponse,
    ...sessionErrorResponses,
    404: { description: "No such organization", schema: ErrorResponse },
    500: { description: "Failed to delete the organization", schema: ErrorResponse },
  },
  handler: async (ctx) => {
    const user = ctx.auth.user;
    const { db } = ctx.context;
    const { organization_id } = ctx.params;

    // Block deletion of hardcoded organizations
    const isHardcoded = getHardcodedOrgs().some((org) => org.organization_id === organization_id);
    if (isHardcoded) {
      return ctx.json(403, { success: false, message: "Cannot delete a system organization!" });
    }

    const registry = new OrganizationsRegistry(db);

    // Check authorization: user must be global admin OR owner of the organization
    const isGlobalAdmin = user.admin === true;
    if (!isGlobalAdmin) {
      const userMemberships = await registry.listUserOrganizationMemberships(user.uid, false);
      const userMembership = userMemberships.find((m) => m.organization_id === organization_id);
      if (!userMembership || userMembership.role !== "owner") {
        return ctx.json(403, {
          success: false,
          message: "Only organization owners or global admins can delete organizations",
        });
      }
    }

    // Verify organization exists before deletion
    try {
      await registry.lookupOrganization(organization_id);
    } catch {
      return ctx.json(404, { success: false, message: "Organization not found" });
    }

    // Delete the organization
    try {
      const result = await registry.deleteOrganization(organization_id);
      if (!result.success) {
        // Determine appropriate status code based on the error message
        if (result.message === "Organization not found") {
          return ctx.json(404, { success: false, message: result.message });
        }
        if (result.message === "Cannot delete a hardcoded organization!") {
          return ctx.json(403, { success: false, message: result.message });
        }
        return ctx.json(400, { success: false, message: result.message });
      }
      return ctx.json(200, { success: true, message: result.message });
    } catch (e: unknown) {
      await captureServerException(db, e, {
        op_name: "DELETE_organization_handler.deleteOrganization",
        route: ROUTE,
        uid: user.uid,
        context: { organization_id },
      });
      return ctx.json(500, { success: false, message: "Failed to delete organization" });
    }
  },
});
