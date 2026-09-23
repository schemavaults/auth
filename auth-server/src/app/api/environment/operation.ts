import { schemaVaultsAppEnvironmentSchema } from "@schemavaults/app-definitions";
import { z, publicAccess } from "@schemavaults/openapi-operations";
import { defineOperation } from "@/lib/api/context";
import { API_TAGS } from "@/lib/api/tags";

export const getEnvironment = defineOperation({
  method: "get",
  path: "/api/environment",
  summary: "Deployment environment",
  description: "Reports which app environment this auth server runs in.",
  tags: [API_TAGS.configuration],
  auth: publicAccess(),
  responses: {
    200: {
      description: "The app environment",
      schema: z.object({ environment: schemaVaultsAppEnvironmentSchema }).openapi("EnvironmentResponse"),
    },
  },
  handler: (ctx) => ctx.json(200, { environment: ctx.context.environment }),
});
