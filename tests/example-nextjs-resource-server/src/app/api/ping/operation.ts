import { z, requireAuth } from "@schemavaults/openapi-operations";
import { defineOperation } from "@/lib/api/context";
import { userCredentialSchemes } from "@/lib/api/auth-schemes";
import { errorResponses, timestampField } from "@/lib/api/schemas";

export const ping = defineOperation({
  method: "post",
  path: "/api/ping",
  summary: "Authenticated ping",
  description:
    "Returns a pong for any signed-in user. Accepts the access token either as a Bearer header (what the account page's test button sends) or as the first-party access token cookie.",
  tags: ["Account"],
  auth: requireAuth({ schemes: userCredentialSchemes }),
  responses: {
    200: {
      description: "Pong",
      schema: z.object({ message: z.literal("Pong!"), timestamp: timestampField }),
    },
    ...errorResponses,
  },
  handler: (ctx) => ctx.json(200, { message: "Pong!", timestamp: Date.now() }),
});
