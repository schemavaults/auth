import { organizationDefinitionSchema, type OrganizationDefinition } from "@schemavaults/auth-common";
import { z, requireAuth } from "@schemavaults/openapi-operations";
import { defineOperation } from "@/lib/api/context";
import { sessionSchemes } from "@/lib/api/auth-schemes";
import { sessionErrorResponses } from "@/lib/api/schemas";
import { API_TAGS } from "@/lib/api/tags";
import { OrganizationsRegistry } from "@/lib/auth-db";
import captureServerException from "@/lib/captureServerException";

const ROUTE = "/api/user/organizations";

export const listUserOrganizations = defineOperation({
  method: "get",
  path: ROUTE,
  summary: "List my organizations",
  description:
    "Lists the definitions of the organizations the caller is a member of (platform administrators also get the owner organization). Organizations that fail to load are skipped and recorded server-side. `GET /api/me/organizations` additionally reports the caller's role in each.",
  tags: [API_TAGS.account],
  auth: requireAuth({ schemes: sessionSchemes }),
  responses: {
    200: {
      description: "The caller's organizations",
      schema: z.object({
        success: z.literal(true),
        organizations: z.array(organizationDefinitionSchema).readonly(),
      }),
    },
    ...sessionErrorResponses,
  },
  handler: async (ctx) => {
    const user = ctx.auth.user!;
    const { db } = ctx.context;
    const organizationsRegistry = new OrganizationsRegistry(db);

    const organizationIds = await organizationsRegistry.listUserOrganizationMembershipIds(
      user.uid,
      user.admin ?? false,
    );

    const organizations: OrganizationDefinition[] = [];
    for (const orgId of organizationIds) {
      try {
        const org = await organizationsRegistry.lookupOrganization(orgId);
        organizations.push(org);
      } catch (e: unknown) {
        await captureServerException(db, e, {
          op_name: "GET_user_organizations.lookupOrganization",
          route: ROUTE,
          uid: user.uid,
          context: { organization_id: orgId, nonFatal: true },
        });
      }
    }

    return ctx.json(200, { success: true, organizations });
  },
});
