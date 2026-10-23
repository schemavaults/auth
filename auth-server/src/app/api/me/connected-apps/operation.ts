import { connectedAppSchema } from "@schemavaults/auth-common";
import { z, requireAuth, withOpenApi } from "@schemavaults/openapi-operations";
import { defineOperation } from "@/lib/api/context";
import { sessionSchemes } from "@/lib/api/auth-schemes";
import { ErrorResponse, sessionErrorResponses } from "@/lib/api/schemas";
import { API_TAGS } from "@/lib/api/tags";
import { listConnectedAppsForUser } from "@/lib/auth-db/api-scope-consents";
import captureServerException from "@/lib/captureServerException";

const ROUTE = "/api/me/connected-apps";

const ConnectedApp = withOpenApi(connectedAppSchema, "ConnectedApp", {
  description:
    "A third-party application the caller authorized: when, when it last received a token for them, and the API scopes they granted it (per API server).",
});

const ListConnectedAppsResponse = z
  .object({ success: z.literal(true), list: z.array(ConnectedApp) })
  .openapi("ListConnectedAppsResponse");

export const listMyConnectedApps = defineOperation({
  method: "get",
  path: ROUTE,
  summary: "List my connected third-party apps",
  description:
    "Lists the client applications the caller authorized (newest first; the auth server's own app is never listed), with the API scopes granted to each. Revoke an app with `DELETE /api/apps/{app_id}/authorize`, or a single API scope with `DELETE /api/me/connected-apps/{app_id}/scopes/{api_server_scope_id}`.",
  tags: [API_TAGS.account],
  auth: requireAuth({ schemes: sessionSchemes }),
  responses: {
    200: { description: "The caller's connected apps", schema: ListConnectedAppsResponse },
    ...sessionErrorResponses,
    500: { description: "Failed to list the connected apps", schema: ErrorResponse },
  },
  handler: async (ctx) => {
    const user = ctx.auth.user;
    const { db } = ctx.context;
    try {
      const list = await listConnectedAppsForUser(db, user.uid);
      return ctx.json(200, { success: true, list });
    } catch (e: unknown) {
      await captureServerException(db, e, {
        op_name: "GET_list_my_connected_apps",
        route: ROUTE,
        uid: user.uid,
      });
      return ctx.json(500, { success: false, message: "Failed to list your connected apps" });
    }
  },
});
