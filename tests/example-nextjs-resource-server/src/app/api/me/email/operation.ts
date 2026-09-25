import { z, requireAuth } from "@schemavaults/openapi-operations";
import { defineOperation } from "@/lib/api/context";
import { userCredentialSchemes } from "@/lib/api/auth-schemes";
import { errorResponses } from "@/lib/api/schemas";

export const myEmail = defineOperation({
  method: "get",
  path: "/api/me/email",
  summary: "My email address",
  description:
    "Only tokens whose `scope` claim includes `email` may read the address; tokens without a scope claim are refused with 403 insufficient_scope.",
  tags: ["Account"],
  auth: requireAuth({ schemes: userCredentialSchemes, requiredScopes: ["email"] }),
  responses: {
    200: { description: "The caller's email", schema: z.object({ email: z.string().nullable() }) },
    ...errorResponses,
  },
  handler: (ctx) => ctx.json(200, { email: ctx.auth.user.email ?? null }),
});
