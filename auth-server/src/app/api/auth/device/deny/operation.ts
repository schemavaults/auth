import { requireAuth } from "@schemavaults/openapi-operations";
import { defineOperation } from "@/lib/api/context";
import { sessionSchemes } from "@/lib/api/auth-schemes";
import { decideDeviceAuthorization } from "@/lib/auth-db/device-authorizations";
import {
  DeviceAuthorizationDecisionResponse,
  DeviceUserCodeRequest,
  DeviceVerificationErrorResponse,
} from "@/lib/api/domain-schemas/device-authorization";
import {
  ErrorResponse,
  RateLimitedResponse,
  sessionErrorResponses,
  validationErrorResponse,
} from "@/lib/api/schemas";
import { API_TAGS } from "@/lib/api/tags";
import recordAuditEvent from "@/lib/audit-log/record-audit-event";
import captureServerException from "@/lib/captureServerException";
import {
  INVALID_USER_CODE_MESSAGE,
  deviceVerificationError,
  loadDeviceAuthorizationForRequest,
} from "../load-device-authorization";

const ROUTE = "/api/auth/device/deny";

export const denyDeviceAuthorization = defineOperation({
  method: "post",
  path: ROUTE,
  summary: "Deny a device sign-in request",
  description:
    "The signed-in user denies the pending device authorization request (RFC 8628) their user code names: the device's next poll of the token endpoint answers `access_denied`, and the code cannot be approved any more. Nothing is granted and the app's existing authorization (if any) is left as it was. Unknown codes count towards the same limits as `POST /api/auth/device/lookup`.",
  tags: [API_TAGS.authentication],
  auth: requireAuth({ schemes: sessionSchemes }),
  request: {
    body: { schema: DeviceUserCodeRequest, description: "The user code of the request to deny." },
  },
  responses: {
    200: { description: "The request was denied", schema: DeviceAuthorizationDecisionResponse },
    ...validationErrorResponse,
    ...sessionErrorResponses,
    404: {
      description: "No pending, unexpired request holds the code (`invalid_user_code`)",
      schema: DeviceVerificationErrorResponse,
    },
    429: { description: "Too many unknown codes", schema: RateLimitedResponse },
    500: { description: "The request could not be denied", schema: ErrorResponse },
  },
  handler: async (ctx) => {
    const user = ctx.auth.user;
    const { dbh, redis } = ctx.context;
    try {
      const loaded = await loadDeviceAuthorizationForRequest({
        db: dbh.db,
        redis: redis.client,
        uid: user.uid,
        request: ctx.request,
        user_code: ctx.body.user_code,
      });
      if (!loaded.ok) {
        return loaded.response;
      }
      const { authorization } = loaded;
      const decided: boolean = await decideDeviceAuthorization(dbh.db, {
        device_authorization_id: authorization.device_authorization_id,
        uid: user.uid,
        decision: { decision: "denied" },
      });
      if (!decided) {
        return deviceVerificationError(404, "invalid_user_code", INVALID_USER_CODE_MESSAGE);
      }
      await recordAuditEvent(dbh.db, {
        event_type: "user.device_authorization_denied",
        actor: user,
        subject: user,
        client_app_id: authorization.client_app_id,
        request: ctx.request,
      });
      return ctx.json(200, {
        success: true as const,
        message: "Denied. The device was not signed in.",
        decision: "denied" as const,
        client_app_id: authorization.client_app_id,
      });
    } catch (e: unknown) {
      await captureServerException(dbh.db, e, {
        op_name: "POST_device_deny",
        route: ROUTE,
        uid: user.uid,
      });
      return ctx.json(500, { success: false, message: "Failed to deny the request" });
    }
  },
});
