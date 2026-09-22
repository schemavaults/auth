import { z, publicAccess } from "@schemavaults/openapi-operations";
import { defineOperation } from "@/lib/api/context";
import { timestampField } from "@/lib/api/schemas";

export const health = defineOperation({
  method: "get",
  path: "/api/health",
  summary: "Liveness probe",
  description: "Unauthenticated health check. Reports the app environment the server runs in.",
  tags: ["Demo"],
  auth: publicAccess("Anyone can call this; it is what load balancers poll."),
  responses: {
    200: {
      description: "The server is up",
      schema: z.object({
        ok: z.literal(true),
        environment: z.enum(["development", "test", "staging", "production"]),
        timestamp: timestampField,
      }),
    },
  },
  handler: (ctx) =>
    ctx.json(200, { ok: true, environment: ctx.context.environment, timestamp: Date.now() }),
});
