import { z, requireAuth } from "@schemavaults/openapi-operations";
import { defineOperation } from "@/lib/api/context";
import { userCredentialSchemes } from "@/lib/api/auth-schemes";
import { ErrorResponse, errorResponses } from "@/lib/api/schemas";

// The `{organization_id}` placeholder maps onto this folder's
// `[organization_id]` dynamic segment. The Hono app parses the parameter
// from the request URL itself, so the route handler never touches Next.js'
// `params`.
export const organizationGreeting = defineOperation({
  method: "get",
  path: "/api/organizations/{organization_id}/greeting",
  summary: "Organization greeting",
  description:
    "Demonstrates an organization membership requirement: the caller must be a member of the organization named in the path (platform administrators bypass the check). Membership is looked up on the auth server with this API server's JWKS access key.",
  tags: ["Organizations"],
  auth: requireAuth({
    schemes: userCredentialSchemes,
    organization: { parameter: "organization_id", roles: [] },
    notes: "Any membership role is accepted.",
  }),
  request: {
    params: z.object({
      organization_id: z.string().min(1).openapi({ description: "Organization id" }),
    }),
  },
  responses: {
    200: {
      description: "A greeting for the organization member",
      schema: z.object({ message: z.string() }),
    },
    400: { description: "The organization id is missing", schema: ErrorResponse },
    ...errorResponses,
  },
  handler: (ctx) =>
    ctx.json(200, {
      message: `Hello ${ctx.auth.user.email ?? ctx.auth.user.uid} of organization ${ctx.params.organization_id}!`,
    }),
});
