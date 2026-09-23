import { schemaVaultsAppDefinitionSchema } from "@schemavaults/app-definitions";
import { requireAuth, withOpenApi } from "@schemavaults/openapi-operations";
import { defineOperation } from "@/lib/api/context";
import { sessionSchemes } from "@/lib/api/auth-schemes";
import { legacyRouteProps } from "@/lib/api/legacy-route-props";
import {
  ErrorResponse,
  ResourceCreationResponse,
  sessionErrorResponses,
  validationErrorResponse,
} from "@/lib/api/schemas";
import { API_TAGS } from "@/lib/api/tags";
import { POST_app_creation_handler } from "./POST_app_creation_handler";

export const createApp = defineOperation({
  method: "post",
  path: "/api/apps",
  summary: "Create a client application",
  description:
    "Registers a new client application (OAuth client). The owner is resolved from the `owner_type` / `owner_organization_id` / `owner_uid` fields: platform-owned apps need a platform administrator, organization-owned apps an owner or admin of that organization, and user-owned apps require the `allow_user_owned_resource_creation` server setting. Apps flagged `hardcoded` cannot be created.",
  tags: [API_TAGS.apps],
  auth: requireAuth({ schemes: sessionSchemes }),
  request: {
    body: {
      lenientContentType: true,
      schema: withOpenApi(schemaVaultsAppDefinitionSchema, "SchemaVaultsAppDefinition"),
      description: "`created_by` and the ownership are derived from the caller and the requested owner fields.",
    },
  },
  responses: {
    200: { description: "The app was created", schema: ResourceCreationResponse },
    ...validationErrorResponse,
    ...sessionErrorResponses,
    409: { description: "An app with this id already exists", schema: ErrorResponse },
    500: { description: "Failed to create the app", schema: ErrorResponse },
  },
  handler: (ctx) => POST_app_creation_handler(legacyRouteProps(ctx), ctx.body),
});
