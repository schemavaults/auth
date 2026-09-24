import {
  listApiServersQueryTypeSchema,
  type ListApiServersQueryType,
} from "@schemavaults/app-definitions";
import { organizationIdSchema, type OrganizationID } from "@schemavaults/auth-common";
import { z, requireAuth } from "@schemavaults/openapi-operations";
import { defineOperation } from "@/lib/api/context";
import { sessionSchemes } from "@/lib/api/auth-schemes";
import { ListApiServersResponse } from "@/lib/api/domain-schemas/apis";
import { ErrorResponse, sessionErrorResponses, validationErrorResponse } from "@/lib/api/schemas";
import { API_TAGS } from "@/lib/api/tags";
import { SchemaVaultsApiServerRegistry } from "@/lib/auth-db";
import captureServerException from "@/lib/captureServerException";
import { isUserInOrganization } from "@/lib/isUserInOrganization";

const ROUTE = "/api/apis";

/**
 * List API servers. The query type is validated by the handler (not the
 * runtime) so the pre-migration 400 messages are kept.
 */
export const listApiServers = defineOperation({
  method: "get",
  path: ROUTE,
  summary: "List API servers",
  description:
    "Lists API server registrations. `list_apis_query_type` selects the scope: `all` (platform administrators only), `org` (members of the organization named by `organization_id`), `owned` (API servers owned by the caller's account) or `accessible` (every API server the caller can reach by ownership).",
  tags: [API_TAGS.apis],
  auth: requireAuth({
    schemes: sessionSchemes,
    notes: "`all` requires a platform administrator; `org` requires membership of that organization.",
  }),
  request: {
    query: z.object({
      list_apis_query_type: z.string().optional().openapi({
        description: "One of `all`, `org`, `owned`, `accessible` (required)",
        example: "accessible",
      }),
      organization_id: z.string().optional().openapi({
        description: "Organization whose API servers to list; required when `list_apis_query_type` is `org`",
        example: "my-organization",
      }),
    }),
  },
  responses: {
    200: { description: "The API servers in the requested scope", schema: ListApiServersResponse },
    ...validationErrorResponse,
    ...sessionErrorResponses,
    500: { description: "Failed to list API servers", schema: ErrorResponse },
  },
  handler: async (ctx) => {
    const user = ctx.auth.user!;
    const { db, environment } = ctx.context;
    if (environment === "development") {
      console.log(`[/api/apis] GET request received`);
    }

    const parsed_query_type = await listApiServersQueryTypeSchema.safeParseAsync(
      ctx.query.list_apis_query_type,
    );
    if (!parsed_query_type.success) {
      return ctx.json(400, { success: false, message: "Invalid list API servers query type" });
    }
    const list_apis_query_type: ListApiServersQueryType = parsed_query_type.data;

    if (list_apis_query_type === "org" && ctx.query.organization_id === undefined) {
      return ctx.json(400, {
        success: false,
        message: "Missing 'organization_id' search param to accompany query type!",
      });
    }
    const organization_id: string | null = ctx.query.organization_id ?? null;
    if (
      list_apis_query_type === "org" &&
      (!organization_id || !organizationIdSchema.safeParse(organization_id).success)
    ) {
      return ctx.json(400, { success: false, message: "Invalid 'organization_id' search param!" });
    }

    const apiServerRegistry = new SchemaVaultsApiServerRegistry(db);

    try {
      switch (list_apis_query_type) {
        case "all":
          if (!user.admin) {
            return ctx.json(403, { success: false, message: "You must be an admin to list all API servers" });
          }
          try {
            return ctx.json(200, {
              success: true,
              message: "Successfully listed all API servers",
              list: await apiServerRegistry.listAllApiServers(),
            });
          } catch (e: unknown) {
            await captureServerException(db, e, {
              op_name: "GET_api_list_handler.listAllApiServers",
              route: ROUTE,
              uid: user.uid,
            });
            return ctx.json(500, { success: false, message: "Failed to list all API servers" });
          }

        case "org":
          if (!organization_id) {
            throw new Error("Expected there to be a valid 'organization_id' set if this point was reached!");
          }
          if (!user.admin) {
            const role = await isUserInOrganization(db, user, organization_id as OrganizationID);
            if (role !== "admin" && role !== "owner" && role !== "member") {
              return ctx.json(403, {
                success: false,
                message: "You must be a member of the organization to list its API servers",
              });
            }
          }
          try {
            return ctx.json(200, {
              success: true,
              message: "Successfully listed all API servers",
              list: await apiServerRegistry.listOrganizationApiServers(organization_id, user),
            });
          } catch (e: unknown) {
            await captureServerException(db, e, {
              op_name: "GET_api_list_handler.listOrganizationApiServers",
              route: ROUTE,
              uid: user.uid,
              context: { organization_id },
            });
            return ctx.json(500, { success: false, message: "Failed to list all API servers for organization" });
          }

        case "owned":
          try {
            return ctx.json(200, {
              success: true,
              message: "Successfully listed the API servers owned by your account",
              list: await apiServerRegistry.listUserOwnedApiServers(user.uid),
            });
          } catch (e: unknown) {
            await captureServerException(db, e, {
              op_name: "GET_api_list_handler.listUserOwnedApiServers",
              route: ROUTE,
              uid: user.uid,
            });
            return ctx.json(500, { success: false, message: "Failed to list the API servers owned by your account" });
          }

        case "accessible":
          try {
            return ctx.json(200, {
              success: true,
              message: "Successfully listed the API servers you can access",
              list: await apiServerRegistry.listApiServersAccessibleToUser(user),
            });
          } catch (e: unknown) {
            await captureServerException(db, e, {
              op_name: "GET_api_list_handler.listApiServersAccessibleToUser",
              route: ROUTE,
              uid: user.uid,
            });
            return ctx.json(500, { success: false, message: "Failed to list the API servers you can access" });
          }

        default:
          return ctx.json(400, { success: false, message: "Unsupported API servers query type" });
      }
    } catch (e: unknown) {
      await captureServerException(db, e, {
        op_name: "GET_api_list_handler.outerCatch",
        route: ROUTE,
        uid: user.uid,
        context: { list_apis_query_type, organization_id },
      });
      return ctx.json(500, { success: false, message: "Failed to list API servers" });
    }
  },
});
