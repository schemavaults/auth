import { z, requireAuth } from "@schemavaults/openapi-operations";
import { defineOperation } from "@/lib/api/context";
import { sessionSchemes } from "@/lib/api/auth-schemes";
import { legacyRouteProps } from "@/lib/api/legacy-route-props";
import { ListAppsQueryResponse } from "@/lib/api/domain-schemas/apps";
import { BadRequestResponse, ErrorResponse, sessionErrorResponses } from "@/lib/api/schemas";
import { API_TAGS } from "@/lib/api/tags";
import { GET_app_list_handler } from "./GET_app_list_handler";

/**
 * The query fields are declared as plain optional strings on purpose: the
 * handler keeps its own validation (and 400 / 403 semantics) of
 * `list_apps_query_type` and `organization_id`.
 */
const query = z.object({
  list_apps_query_type: z
    .string()
    .optional()
    .openapi({
      description:
        'Which apps to list: "all" (platform administrators only), "public" (publicly listed apps), "authorized" (apps the caller has authorized), "org" (apps owned by `organization_id`; members only), "owned" (apps owned by the caller\'s account) or "accessible" (every app the caller can reach by ownership). Required; an unknown value is a 400.',
      example: "public",
    }),
  organization_id: z
    .string()
    .optional()
    .openapi({
      description: 'The organization whose apps to list; required with `list_apps_query_type=org`.',
      example: "my-organization",
    }),
});

export const listApps = defineOperation({
  method: "get",
  path: "/api/apps",
  summary: "List client applications",
  description:
    "Lists client applications selected by `list_apps_query_type`. Listing every app requires a platform administrator; listing an organization's apps requires membership of that organization (or administrator rights).",
  tags: [API_TAGS.apps],
  auth: requireAuth({ schemes: sessionSchemes }),
  request: { query },
  responses: {
    200: { description: "The selected apps", schema: ListAppsQueryResponse },
    400: {
      description:
        "Missing or unknown `list_apps_query_type`, a missing / malformed `organization_id` for the org query, or a malformed query string",
      schema: BadRequestResponse,
    },
    ...sessionErrorResponses,
    500: { description: "Failed to list apps", schema: ErrorResponse },
  },
  handler: (ctx) => GET_app_list_handler(legacyRouteProps(ctx), ctx.query),
});
