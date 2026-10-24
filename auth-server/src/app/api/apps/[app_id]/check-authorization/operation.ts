import { oidcScopeSchema, resourceIndicatorSchema } from "@schemavaults/auth-common";
import { requireAuth, z } from "@schemavaults/openapi-operations";
import { defineOperation } from "@/lib/api/context";
import { sessionSchemes } from "@/lib/api/auth-schemes";
import { AppAuthorizationStatusResponse, appIdParams } from "@/lib/api/domain-schemas/apps";
import { ErrorResponse, sessionErrorResponses, validationErrorResponse } from "@/lib/api/schemas";
import { API_TAGS } from "@/lib/api/tags";
import captureServerException from "@/lib/captureServerException";
import { describeAppConsentStatus, toAppConsentStatus } from "@/lib/oauth2/api-scopes";

const CheckAppAuthorizationQuery = z.object({
  scope: oidcScopeSchema.optional().openapi({
    description: "The authorization request's requested scopes (space delimited).",
    example: "openid email notes:read",
  }),
  resource: resourceIndicatorSchema.optional().openapi({
    description:
      "The authorization request's RFC 8707 resource indicator, whose API scopes `scope` may ask for.",
    example: "https://api.example.com/mcp",
  }),
});

export const checkAppAuthorization = defineOperation({
  method: "get",
  path: "/api/apps/{app_id}/check-authorization",
  summary: "Check whether the caller authorized an app",
  description:
    "Reports whether the signed-in user has already authorized the client application to receive tokens on their behalf (`authorized`), and — given the authorization request's `scope` and `resource` — whether the consent screen has to be shown before an authorization code is handed to the app (`consent_required`): the app is not authorized yet, or the request asks for API scopes the user has not granted it (`pending_api_scopes`). The auth server's own app is always reported as authorized and never needs consent.",
  tags: [API_TAGS.apps],
  auth: requireAuth({ schemes: sessionSchemes }),
  request: { params: appIdParams, query: CheckAppAuthorizationQuery },
  responses: {
    200: { description: "The authorization status", schema: AppAuthorizationStatusResponse },
    ...validationErrorResponse,
    ...sessionErrorResponses,
    500: { description: "Failed to check the authorization status", schema: ErrorResponse },
  },
  handler: async (ctx) => {
    const user = ctx.auth.user;
    const { dbh, environment, debug } = ctx.context;
    const { app_id } = ctx.params;
    try {
      const status = await describeAppConsentStatus({
        dbh,
        uid: user.uid,
        client_app_id: app_id,
        scope: ctx.query.scope ?? null,
        resource: ctx.query.resource ?? null,
        environment,
        debug,
      });
      return ctx.json(200, toAppConsentStatus(status));
    } catch (e: unknown) {
      await captureServerException(dbh.db, e, {
        op_name: "GET_check_app_authorization.describeAppConsentStatus",
        route: "/api/apps/[app_id]/check-authorization",
        uid: user.uid,
        context: { app_id },
      });
      return ctx.json(500, { success: false, message: "Failed to check app authorization status" });
    }
  },
});
