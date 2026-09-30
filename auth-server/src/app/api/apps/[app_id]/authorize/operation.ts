import { oauth2StateSchema } from "@schemavaults/auth-common";
import { z, requireAuth } from "@schemavaults/openapi-operations";
import { defineOperation } from "@/lib/api/context";
import { sessionSchemes } from "@/lib/api/auth-schemes";
import { AppAuthorizationRevocationResponse, appIdParams } from "@/lib/api/domain-schemas/apps";
import {
  ErrorResponse,
  ResourceCreationResponse,
  sessionErrorResponses,
  validationErrorResponse,
} from "@/lib/api/schemas";
import { API_TAGS } from "@/lib/api/tags";
import AuthorizedAppsRegistry, {
  removeAppAuthorizationForUser,
} from "@/lib/auth-db/apps/authorized-apps-registry";
import { revokeTokensIssuedToClientApp } from "@/lib/auth-db/token-revocations";
import captureServerException from "@/lib/captureServerException";
import getAuthServerAppId from "@/lib/config/auth-server-app-id";

const ROUTE = "/api/apps/{app_id}/authorize";

// Optional OAuth2 `state` parameter (RFC 6749 §10.12). Accepted on the
// consent POST so clients can declare the nonce they generated — it is
// not persisted here (the browser round-trips state through the
// authorize URL → callback URL path on its own). Parsing it lets the
// server reject malformed values early and log the CSRF nonce length
// in development for debugging mismatches.
const AuthorizeAppRequest = z
  .object({
    state: oauth2StateSchema.optional().openapi({
      description:
        "The OAuth2 `state` nonce of the in-flight authorization request. Validated, logged in development, never persisted.",
    }),
  })
  .strict()
  .openapi("AuthorizeAppRequest");

export const authorizeApp = defineOperation({
  method: "post",
  path: ROUTE,
  summary: "Authorize a client application",
  description:
    "Records the caller's consent for a client application to receive tokens on their behalf. Idempotent. The auth server's own app is always authorized and cannot be explicitly authorized (403). The JSON body is optional.",
  tags: [API_TAGS.apps],
  auth: requireAuth({ schemes: sessionSchemes }),
  request: {
    params: appIdParams,
    body: {
      required: false,
      lenientContentType: true,
      schema: AuthorizeAppRequest,
      description: "Optional; unknown fields are rejected.",
    },
  },
  responses: {
    200: { description: "The app is authorized for the caller", schema: ResourceCreationResponse },
    ...validationErrorResponse,
    ...sessionErrorResponses,
    500: { description: "Failed to record the authorization", schema: ErrorResponse },
  },
  handler: async (ctx) => {
    const user = ctx.auth.user;
    const { db, environment } = ctx.context;
    const { app_id } = ctx.params;
    if (environment === "development") {
      console.log("[/api/apps/[app_id]/authorize] POST request received");
    }

    if (app_id === getAuthServerAppId()) {
      return ctx.json(403, {
        success: false,
        message: "The auth app is always authorized and cannot be explicitly authorized",
      });
    }

    // A missing body is fine — older clients simply won't send it.
    const parsedState: string | undefined = ctx.body?.state;
    if (environment === "development" && typeof parsedState === "string") {
      console.log(
        `[/api/apps/${app_id}/authorize] Received OAuth2 state (length=${parsedState.length}); will be echoed on callback by the browser, not persisted server-side.`,
      );
    }

    try {
      const registry = new AuthorizedAppsRegistry(db);
      await registry.authorizeAppForUser(
        user.uid, // user id
        app_id, // frontend app id
      );
      return ctx.json(200, {
        success: true,
        message: "Successfully authorized frontend application to receive tokens on your behalf",
        resource_id: app_id,
      });
    } catch (e: unknown) {
      await captureServerException(db, e, {
        op_name: "POST_authorize_client_application.authorizeAppForUser",
        route: "/api/apps/[app_id]/authorize",
        uid: user.uid,
        context: { app_id },
      });
      return ctx.json(500, { success: false, message: "Failed to authorize frontend application" });
    }
  },
});

export const revokeAppAuthorization = defineOperation({
  method: "delete",
  path: ROUTE,
  summary: "Revoke a client application's authorization",
  description:
    "Withdraws the caller's consent for a client application to receive tokens on their behalf, and revokes the app's unexpired access and refresh tokens issued for the caller. From then on the app's refresh tokens are refused at the token endpoint, token introspection reports its tokens inactive, and signing in to the app asks for consent again. Idempotent: `was_authorized` is false when there was nothing to revoke. The auth server's own app is always authorized and cannot be de-authorized (403).",
  tags: [API_TAGS.apps],
  auth: requireAuth({ schemes: sessionSchemes }),
  request: { params: appIdParams },
  responses: {
    200: { description: "The app is no longer authorized for the caller", schema: AppAuthorizationRevocationResponse },
    ...validationErrorResponse,
    ...sessionErrorResponses,
    500: { description: "Failed to revoke the authorization", schema: ErrorResponse },
  },
  handler: async (ctx) => {
    const user = ctx.auth.user;
    const { db, debug } = ctx.context;
    const { app_id } = ctx.params;

    if (app_id === getAuthServerAppId()) {
      return ctx.json(403, {
        success: false,
        message: "The auth app is always authorized and cannot be de-authorized",
      });
    }

    try {
      // One transaction: the consent and the tokens it granted go together.
      const { was_authorized, revoked_token_count } = await db
        .transaction()
        .execute(async (trx) => ({
          was_authorized: await removeAppAuthorizationForUser(trx, user.uid, app_id, debug),
          revoked_token_count: await revokeTokensIssuedToClientApp(trx, user.uid, app_id),
        }));
      if (debug) {
        console.log(
          `[/api/apps/${app_id}/authorize] DELETE: removed authorization=${was_authorized}, revoked ${revoked_token_count} token(s) for user '${user.uid}'`,
        );
      }
      return ctx.json(200, {
        success: true,
        message: was_authorized
          ? "Revoked the client application's authorization to receive tokens on your behalf"
          : "The client application was not authorized to receive tokens on your behalf",
        resource_id: app_id,
        was_authorized,
        revoked_token_count,
      });
    } catch (e: unknown) {
      await captureServerException(db, e, {
        op_name: "DELETE_revoke_client_application_authorization",
        route: "/api/apps/[app_id]/authorize",
        uid: user.uid,
        context: { app_id },
      });
      return ctx.json(500, { success: false, message: "Failed to revoke the client application's authorization" });
    }
  },
});
