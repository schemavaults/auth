import { requireAuth } from "@schemavaults/openapi-operations";
import { defineOperation } from "@/lib/api/context";
import { sessionSchemes } from "@/lib/api/auth-schemes";
import {
  ApproveDeviceAuthorizationRequest,
  DeviceAuthorizationDecisionResponse,
  DeviceVerificationErrorResponse,
} from "@/lib/api/domain-schemas/device-authorization";
import {
  ErrorResponse,
  RateLimitedResponse,
  validationErrorResponse,
} from "@/lib/api/schemas";
import { API_TAGS } from "@/lib/api/tags";
import recordAuditEvent from "@/lib/audit-log/record-audit-event";
import captureServerException from "@/lib/captureServerException";
import { approveDeviceAuthorization } from "@/lib/device-verification";
import { EMAIL_VERIFICATION_REQUIRED_MESSAGE } from "@/lib/email-verification/third-party-app-gate";
import {
  INVALID_USER_CODE_MESSAGE,
  deviceVerificationError,
  loadDeviceAuthorizationForRequest,
} from "../load-device-authorization";

const ROUTE = "/api/auth/device/approve";

export const approveDeviceAuthorizationOperation = defineOperation({
  method: "post",
  path: ROUTE,
  summary: "Approve a device sign-in request",
  description:
    "The signed-in user approves the pending device authorization request (RFC 8628) their user code names: the client application is authorized for them, with the API scopes they approved (`approved_api_scopes`, among those the request asks for and the app may be granted), and the device's next poll of the token endpoint receives tokens for their account with the granted scope. " +
    "Refused with 403 `email_verification_required` while the account's address is unverified and the deployment requires verification before a third-party hand-off. Unknown codes count towards the same limits as `POST /api/auth/device/lookup`.",
  tags: [API_TAGS.authentication],
  auth: requireAuth({ schemes: sessionSchemes }),
  request: {
    body: { schema: ApproveDeviceAuthorizationRequest, description: "The user code and the API scopes approved." },
  },
  responses: {
    200: { description: "The request was approved", schema: DeviceAuthorizationDecisionResponse },
    ...validationErrorResponse,
    401: {
      description: "No valid session cookie, access token cookie or bearer access token was presented, or the token was revoked",
      schema: ErrorResponse,
    },
    403: {
      description:
        "The account is disabled, or its address must be verified first (`email_verification_required`)",
      schema: DeviceVerificationErrorResponse,
    },
    404: {
      description: "No pending, unexpired request holds the code (`invalid_user_code`)",
      schema: DeviceVerificationErrorResponse,
    },
    429: { description: "Too many unknown codes", schema: RateLimitedResponse },
    500: { description: "The request could not be approved", schema: ErrorResponse },
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
      const { authorization } = loaded;
      const result = await approveDeviceAuthorization({
        dbh,
        redis: redis.client,
        uid: user.uid,
        authorization,
        approved_api_scopes: ctx.body.approved_api_scopes ?? [],
        environment,
        debug,
      });
      switch (result.kind) {
        case "email_verification_required":
          return deviceVerificationError(
            403,
            "email_verification_required",
            EMAIL_VERIFICATION_REQUIRED_MESSAGE,
          );
        case "no_longer_pending":
          return deviceVerificationError(404, "invalid_user_code", INVALID_USER_CODE_MESSAGE);
        case "approved":
          await recordAuditEvent(dbh.db, {
            event_type: "user.device_authorized",
            actor: user,
            subject: user,
            client_app_id: authorization.client_app_id,
            request: ctx.request,
            details: result.api_scopes.length > 0 ? { api_scopes: result.api_scopes } : undefined,
          });
          return ctx.json(200, {
            success: true as const,
            message: "Approved. Return to your device to continue.",
            decision: "approved" as const,
            client_app_id: authorization.client_app_id,
            scope: result.scope,
          });
      }
    } catch (e: unknown) {
      await captureServerException(dbh.db, e, {
        op_name: "POST_device_approve",
        route: ROUTE,
        uid: user.uid,
      });
      return ctx.json(500, { success: false, message: "Failed to approve the request" });
    }
  },
});
