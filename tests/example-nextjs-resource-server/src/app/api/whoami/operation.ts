import { z, requireAuth } from "@schemavaults/openapi-operations";
import { defineOperation } from "@/lib/api/context";
import { userCredentialSchemes } from "@/lib/api/auth-schemes";
import { errorResponses } from "@/lib/api/schemas";

export const whoami = defineOperation({
  method: "get",
  path: "/api/whoami",
  summary: "Who am I",
  description:
    "Returns the identity resolved from the presented credential, plus which auth scheme resolved it, the scope granted to the token and, for a delegated token, who acts on the user's behalf.",
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
          actor: z
            .object({
              sub: z.string().openapi({ description: "The current actor (RFC 8693 `act.sub`), e.g. a client app's agent" }),
              client_id: z.string().nullable().openapi({ description: "The client app the actor acts through" }),
            })
            .nullable()
            .openapi({ description: "Who acts on behalf of the user (a delegated token); null for the user's own token" }),
        })
        .openapi("Whoami"),
    },
    ...errorResponses,
  },
  handler: (ctx) =>
    ctx.json(200, {
      uid: ctx.auth.user.uid,
      email: ctx.auth.user.email ?? null,
      admin: ctx.auth.isAdmin,
      scheme: ctx.auth.scheme,
      scope: ctx.auth.scope,
      actor: ctx.auth.actor
        ? { sub: ctx.auth.actor.sub, client_id: ctx.auth.actor.clientId ?? null }
        : null,
    }),
});
