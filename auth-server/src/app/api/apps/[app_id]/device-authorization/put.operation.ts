import { isDynamicallyRegisteredClient } from "@schemavaults/app-definitions";
import { requireAuth } from "@schemavaults/openapi-operations";
import { defineOperation } from "@/lib/api/context";
import { sessionSchemes } from "@/lib/api/auth-schemes";
import { appIdParams, appManagementErrorResponses } from "@/lib/api/domain-schemas/apps";
import { ErrorResponse, sessionErrorResponses, validationErrorResponse } from "@/lib/api/schemas";
import { API_TAGS } from "@/lib/api/tags";
import {
  getAppDeviceAuthorizationPolicy,
  setAppDeviceAuthorizationEnabled,
} from "@/lib/auth-db/device-authorizations";
import captureServerException from "@/lib/captureServerException";
import loadAppForManagement from "@/lib/load-app-for-management";
import {
  AppDeviceAuthorizationPolicyResponse,
  DEVICE_AUTHORIZATION_POLICY_ROUTE,
  SetAppDeviceAuthorizationPolicyRequest,
  summarizeAppDeviceAuthorizationPolicy,
} from "./shared";

export const setAppDeviceAuthorizationPolicyOperation = defineOperation({
  method: "put",
  path: "/api/apps/{app_id}/device-authorization",
  summary: "Enable or disable an app's device authorization grant",
  description:
    "Enables or disables the OAuth 2.0 device authorization grant (RFC 8628) for the client application. Enable it for apps that run where the login page cannot be shown, such as command-line tools or TV apps: the app then asks `POST /api/oidc/device_authorization` for a code, and its users approve it on the auth server's `/device` page. " +
    "It is off by default because whoever starts a device flow chooses who is shown its code: anyone who knows the app's id can ask a user to approve a request in the app's name. Disabling takes effect at once: the app's requests that were not redeemed yet are discarded, and devices still polling get `unauthorized_client`. Dynamically registered clients can never use the grant, so the setting cannot be changed for them either way (409). Idempotent. Requires management access; hardcoded apps cannot be configured.",
  tags: [API_TAGS.apps],
  auth: requireAuth({ schemes: sessionSchemes }),
  request: {
    params: appIdParams,
    body: { lenientContentType: true, schema: SetAppDeviceAuthorizationPolicyRequest },
  },
  responses: {
    200: { description: "The app's setting, as saved", schema: AppDeviceAuthorizationPolicyResponse },
    ...validationErrorResponse,
    ...sessionErrorResponses,
    ...appManagementErrorResponses,
    409: {
      description:
        "The app is a dynamically registered client, which can never use the grant: every `PUT` is refused, enabling or disabling",
      schema: ErrorResponse,
    },
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
      op_name: "PUT_app_device_authorization_policy",
    });
    if (!guard.ok) return guard.response;
    // The body schema already requires a boolean; checked again here so the
    // setting can never be written from anything else.
    const enabled: unknown = ctx.body.enabled;
    if (typeof enabled !== "boolean") {
      return ctx.json(400, {
        success: false,
        message: "'enabled' must be a boolean.",
      });
    }
    // The grant is never available to a dynamically registered client, so
    // its setting cannot be changed either way.
    if (isDynamicallyRegisteredClient(guard.app)) {
      return ctx.json(409, {
        success: false,
        message: "Dynamically registered clients cannot use the device authorization grant.",
      });
    }
    try {
      await setAppDeviceAuthorizationEnabled(db, app_id, enabled, user.uid);
      const policy = await getAppDeviceAuthorizationPolicy(db, app_id);
      return ctx.json(200, summarizeAppDeviceAuthorizationPolicy(guard.app, policy));
    } catch (e: unknown) {
      await captureServerException(db, e, {
        op_name: "PUT_app_device_authorization_policy",
        route: DEVICE_AUTHORIZATION_POLICY_ROUTE,
        uid: user.uid,
        context: { app_id, enabled },
      });
      return ctx.json(500, { success: false, message: "Failed to save the device authorization setting" });
    }
  },
});
