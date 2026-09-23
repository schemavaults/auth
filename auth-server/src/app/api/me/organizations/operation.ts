import {
  organizationMembershipRoleDetailsSchema,
  type OrganizationDefinition,
  type OrganizationMembershipRoleDetails,
} from "@schemavaults/auth-common";
import { z, requireAuth, withOpenApi } from "@schemavaults/openapi-operations";
import { defineOperation } from "@/lib/api/context";
import { sessionSchemes } from "@/lib/api/auth-schemes";
import { ErrorResponse, sessionErrorResponses } from "@/lib/api/schemas";
import { API_TAGS } from "@/lib/api/tags";
import {
  listUserOrganizationMemberships,
  OrganizationsRegistry,
  type OrganizationMembershipRoleDefinition,
} from "@/lib/auth-db/organizations";
import captureServerException from "@/lib/captureServerException";
import { MY_ORGANIZATIONS_ROUTE } from "./cors";

export const listMyOrganizations = defineOperation({
  method: "get",
  path: MY_ORGANIZATIONS_ROUTE,
  summary: "List my organization memberships",
  description:
    "Lists the organizations the caller belongs to with their role in each (platform administrators also see their virtual `admin` membership of the owner organization). Answers with CORS headers so client applications may call it cross-origin with a bearer access token.",
  tags: [API_TAGS.account],
  auth: requireAuth({ schemes: sessionSchemes }),
  responses: {
    200: {
      description: "The caller's memberships",
      schema: z.object({
        success: z.literal(true),
        message: z.string(),
        data: z.object({
          memberships: z
            .array(withOpenApi(organizationMembershipRoleDetailsSchema, "OrganizationMembershipRoleDetails"))
            .readonly(),
        }),
      }),
    },
    ...sessionErrorResponses,
    500: { description: "Failed to list the memberships", schema: ErrorResponse },
  },
  handler: async (ctx) => {
    const user = ctx.auth.user!;
    const { db } = ctx.context;
    try {
      const admin: boolean = user.admin ?? false;
      const memberships: readonly OrganizationMembershipRoleDefinition[] =
        await listUserOrganizationMemberships(db, user.uid, admin);

      const organizationsRegistry = new OrganizationsRegistry(db);

      const enrichedResults = await Promise.allSettled(
        memberships.map(async (membership): Promise<OrganizationMembershipRoleDetails> => {
          const orgDef: OrganizationDefinition = await organizationsRegistry.lookupOrganization(
            membership.organization_id,
          );
          const candidate = {
            organization_id: membership.organization_id,
            organization_name: orgDef.name,
            role: membership.role,
            created_at: orgDef.created_at,
            joined_at: membership.created_at,
          };
          const parsed = await organizationMembershipRoleDetailsSchema.safeParseAsync(candidate);
          if (!parsed.success) {
            throw new Error(
              `Failed to validate OrganizationMembershipRoleDetails for organization "${membership.organization_id}": ${parsed.error.message}`,
            );
          }
          return parsed.data;
        }),
      );

      const enrichedMemberships: OrganizationMembershipRoleDetails[] = [];
      for (const [i, result] of enrichedResults.entries()) {
        if (result.status === "fulfilled") {
          enrichedMemberships.push(result.value);
        } else {
          const failedMembership = memberships[i];
          await captureServerException(db, result.reason, {
            op_name: "GET_my_organizations_handler.enrichMembership",
            route: MY_ORGANIZATIONS_ROUTE,
            uid: user.uid,
            context: {
              organization_id: failedMembership?.organization_id ?? "unknown",
              nonFatal: true,
            },
          });
        }
      }

      return ctx.json(200, {
        success: true,
        message: "Successfully listed user organization memberships",
        data: { memberships: enrichedMemberships },
      });
    } catch (e: unknown) {
      await captureServerException(db, e, {
        op_name: "GET_my_organizations_handler.listUserOrganizationMemberships",
        route: MY_ORGANIZATIONS_ROUTE,
        uid: user.uid,
      });
      return ctx.json(500, { success: false, message: "Failed to list user organization memberships" });
    }
  },
});
