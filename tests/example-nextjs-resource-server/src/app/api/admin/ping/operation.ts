import { z, requireAuth } from "@schemavaults/openapi-operations";
import { defineOperation } from "@/lib/api/context";
import { userCredentialSchemes } from "@/lib/api/auth-schemes";
import { errorResponses, timestampField } from "@/lib/api/schemas";

export const adminPing = defineOperation({
  method: "get",
  path: "/api/admin/ping",
  summary: "Administrator ping",
  description: "Only platform administrators (users with the `admin` flag) may call this.",
  tags: ["Admin"],
  auth: requireAuth({ schemes: userCredentialSchemes, routeGuard: "admin" }),
  responses: {
    200: {
      description: "Admin pong",
      schema: z.object({ message: z.literal("Admin pong!"), timestamp: timestampField }),
    },
    ...errorResponses,
  },
  handler: (ctx) => ctx.json(200, { message: "Admin pong!", timestamp: Date.now() }),
});
