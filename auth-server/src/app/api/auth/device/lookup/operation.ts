import { formatUserCode } from "@schemavaults/auth-common";
import { requireAuth } from "@schemavaults/openapi-operations";
import { defineOperation } from "@/lib/api/context";
import { sessionSchemes } from "@/lib/api/auth-schemes";
import {
  DeviceAuthorizationDescription,
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
import captureServerException from "@/lib/captureServerException";
import { describeDeviceAuthorization } from "@/lib/device-verification";
import {
  INVALID_USER_CODE_MESSAGE,
  deviceVerificationError,
  loadDeviceAuthorizationForRequest,
} from "../load-device-authorization";

const ROUTE = "/api/auth/device/lookup";

export const lookupDeviceAuthorization = defineOperation({
  method: "post",
  path: ROUTE,
  summary: "Look up a device sign-in request",
  description:
    "The `/device` page's first step of the device authorization grant (RFC 8628): the signed-in user enters the user code their device shows, and gets back what the device asks for — the client application, the expiry, and the requested scopes in the consent screen's shape (`consent`) — so they can approve (`POST /api/auth/device/approve`) or deny (`POST /api/auth/device/deny`) it. " +
    "Only pending, unexpired requests are found. Unknown codes are counted per account and per IP, and after a handful the endpoint answers 429 until the window passes (RFC 8628 §5.1 brute-force protection); codes that are found are never counted.",
  tags: [API_TAGS.authentication],
  auth: requireAuth({ schemes: sessionSchemes }),
  request: {
    body: { schema: DeviceUserCodeRequest, description: "The user code to look up." },
  },
  responses: {
    200: { description: "The pending request", schema: DeviceAuthorizationDescription },
    ...validationErrorResponse,
    ...sessionErrorResponses,
    404: {
      description: "No pending, unexpired request holds the code (`invalid_user_code`)",
      schema: DeviceVerificationErrorResponse,
    },
    429: { description: "Too many unknown codes", schema: RateLimitedResponse },
    500: { description: "The code could not be looked up", schema: ErrorResponse },
  },
  handler: async (ctx) => {
    const user = ctx.auth.user;
    const { dbh, redis, environment, debug } = ctx.context;
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
      const described = await describeDeviceAuthorization({
        dbh,
        uid: user.uid,
        authorization: loaded.authorization,
        environment,
        debug,
      });
      if (described === null) {
        return deviceVerificationError(404, "invalid_user_code", INVALID_USER_CODE_MESSAGE);
      }
      return ctx.json(200, {
        success: true as const,
        user_code: formatUserCode(ctx.body.user_code),
        ...described,
      });
    } catch (e: unknown) {
      await captureServerException(dbh.db, e, {
        op_name: "POST_device_lookup",
        route: ROUTE,
        uid: user.uid,
      });
      return ctx.json(500, { success: false, message: "Failed to look up the code" });
    }
  },
});
