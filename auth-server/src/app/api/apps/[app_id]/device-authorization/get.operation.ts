import { requireAuth } from "@schemavaults/openapi-operations";
import { defineOperation } from "@/lib/api/context";
import { sessionSchemes } from "@/lib/api/auth-schemes";
import { appIdParams, appManagementErrorResponses } from "@/lib/api/domain-schemas/apps";
import { sessionErrorResponses, validationErrorResponse } from "@/lib/api/schemas";
import { API_TAGS } from "@/lib/api/tags";
import { getAppDeviceAuthorizationPolicy } from "@/lib/auth-db/device-authorizations";
import captureServerException from "@/lib/captureServerException";
import loadAppForManagement from "@/lib/load-app-for-management";
import {
  AppDeviceAuthorizationPolicyResponse,
  DEVICE_AUTHORIZATION_POLICY_ROUTE,
  summarizeAppDeviceAuthorizationPolicy,
} from "./shared";

export const getAppDeviceAuthorizationPolicyOperation = defineOperation({
  method: "get",
  path: "/api/apps/{app_id}/device-authorization",
  summary: "Get an app's device authorization grant setting",
  description:
    "Whether the client application may use the OAuth 2.0 device authorization grant (RFC 8628): start device flows at `POST /api/oidc/device_authorization` and redeem them at the token endpoint. Off for every app until its managers enable it. Requires management access; hardcoded apps cannot be configured.",
  tags: [API_TAGS.apps],
  auth: requireAuth({ schemes: sessionSchemes }),
  request: { params: appIdParams },
  responses: {
    200: { description: "The app's setting", schema: AppDeviceAuthorizationPolicyResponse },
    ...validationErrorResponse,
    ...sessionErrorResponses,
    ...appManagementErrorResponses,
  },
  handler: async (ctx) => {
    const user = ctx.auth.user;
    const { db, dbh } = ctx.context;
    const { app_id } = ctx.params;
    const guard = await loadAppForManagement({
      app_id,
      user,
      dbh,
      route: DEVICE_AUTHORIZATION_POLICY_ROUTE,
      op_name: "GET_app_device_authorization_policy",
    });
    if (!guard.ok) return guard.response;
    try {
      const policy = await getAppDeviceAuthorizationPolicy(db, app_id);
      return ctx.json(200, summarizeAppDeviceAuthorizationPolicy(guard.app, policy));
    } catch (e: unknown) {
      await captureServerException(db, e, {
        op_name: "GET_app_device_authorization_policy",
        route: DEVICE_AUTHORIZATION_POLICY_ROUTE,
        uid: user.uid,
        context: { app_id },
      });
      return ctx.json(500, { success: false, message: "Failed to load the device authorization setting" });
    }
  },
});
