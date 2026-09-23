import { requireAuth } from "@schemavaults/openapi-operations";
import { defineOperation } from "@/lib/api/context";
import { sessionSchemes } from "@/lib/api/auth-schemes";
import { AppAuthorizationStatusResponse, appIdParams } from "@/lib/api/domain-schemas/apps";
import { ErrorResponse, sessionErrorResponses, validationErrorResponse } from "@/lib/api/schemas";
import { API_TAGS } from "@/lib/api/tags";
import AuthorizedAppsRegistry from "@/lib/auth-db/apps/authorized-apps-registry";
import captureServerException from "@/lib/captureServerException";
import getAuthServerAppId from "@/lib/config/auth-server-app-id";

export const checkAppAuthorization = defineOperation({
  method: "get",
  path: "/api/apps/{app_id}/check-authorization",
  summary: "Check whether the caller authorized an app",
  description:
    "Reports whether the signed-in user has already authorized the client application to receive tokens on their behalf. The auth server's own app is always reported as authorized.",
  tags: [API_TAGS.apps],
  auth: requireAuth({ schemes: sessionSchemes }),
  request: { params: appIdParams },
  responses: {
    200: { description: "The authorization status", schema: AppAuthorizationStatusResponse },
    ...validationErrorResponse,
    ...sessionErrorResponses,
    500: { description: "Failed to check the authorization status", schema: ErrorResponse },
  },
  handler: async (ctx) => {
    const user = ctx.auth.user!;
    const { db, environment } = ctx.context;
    const { app_id } = ctx.params;
    if (environment === "development") {
      console.log("[/api/apps/[app_id]/check-authorization] GET request received");
    }

    if (app_id === getAuthServerAppId()) {
      return ctx.json(200, { success: true, authorized: true });
    }

    try {
      const registry = new AuthorizedAppsRegistry(db);
      const authorized = await registry.isAppAuthorizedForUser(user.uid, app_id);
      return ctx.json(200, { success: true, authorized });
    } catch (e: unknown) {
      await captureServerException(db, e, {
        op_name: "GET_check_app_authorization.isAppAuthorizedForUser",
        route: "/api/apps/[app_id]/check-authorization",
        uid: user.uid,
        context: { app_id },
      });
      return ctx.json(500, { success: false, message: "Failed to check app authorization status" });
    }
  },
});
