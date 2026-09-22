import { z, requireAuth } from "@schemavaults/openapi-operations";
import { defineOperation } from "@/lib/api/context";
import { userCredentialSchemes } from "@/lib/api/auth-schemes";
import { errorResponses } from "@/lib/api/schemas";

export const whoami = defineOperation({
  method: "get",
  path: "/api/whoami",
  summary: "Who am I",
  description:
    "Returns the identity resolved from the presented credential, plus which auth scheme resolved it and the scope granted to the token.",
  tags: ["Account"],
  auth: requireAuth({ schemes: userCredentialSchemes }),
  responses: {
    200: {
      description: "The caller's identity",
      schema: z
        .object({
          uid: z.string().openapi({ description: "SchemaVaults user id" }),
          email: z.string().nullable(),
          admin: z.boolean(),
          scheme: z.string().openapi({
            description: "Name of the auth scheme that resolved the credential",
            example: "schemavaults-access-token",
          }),
          scope: z.string().nullable().openapi({
            description: "Space separated scope granted to the token, or null when it carries no scope claim",
          }),
        })
        .openapi("Whoami"),
    },
    ...errorResponses,
  },
  handler: (ctx) =>
    ctx.json(200, {
      uid: ctx.auth.user?.uid ?? "",
      email: ctx.auth.user?.email ?? null,
      admin: ctx.auth.isAdmin,
      scheme: ctx.auth.scheme,
      scope: ctx.auth.scope,
    }),
});
