import { appIdSchema } from "@schemavaults/app-definitions";
import { z, requireAuth, withOpenApi } from "@schemavaults/openapi-operations";
import { defineOperation } from "@/lib/api/context";
import { sessionSchemes } from "@/lib/api/auth-schemes";
import { ErrorResponse, sessionErrorResponses, validationErrorResponse } from "@/lib/api/schemas";
import { API_TAGS } from "@/lib/api/tags";
import { revokeApiScopeConsent } from "@/lib/auth-db/api-scope-consents";
import { revokeAccessTokensIssuedToClientAppForAudience } from "@/lib/auth-db/token-revocations";
import captureServerException from "@/lib/captureServerException";

const ROUTE = "/api/me/connected-apps/{app_id}/scopes/{api_server_scope_id}";

const params = z.object({
  app_id: withOpenApi(appIdSchema, { description: "Client application id", example: "my-web-app" }),
  api_server_scope_id: z.guid().openapi({ description: "Id of the API scope to withdraw" }),
});

const ApiScopeConsentRevocationResponse = z
  .object({
    success: z.literal(true),
    message: z.string(),
    was_granted: z
      .boolean()
      .openapi({ description: "Whether the caller had granted the scope; false means there was nothing to withdraw" }),
    revoked_token_count: z.number().int().nonnegative().openapi({
      description: "How many of the app's unexpired access tokens for the scope's API server were revoked",
    }),
  })
  .openapi("ApiScopeConsentRevocationResponse");

export const revokeMyAppScopeConsent = defineOperation({
  method: "delete",
  path: ROUTE,
  summary: "Withdraw an API scope from a connected app",
  description:
    "Withdraws the caller's consent to one API scope for a client application. The app's unexpired access tokens for that scope's API server are revoked (resource servers that introspect tokens or check revocation stop accepting them; ones that only verify signatures accept them until they expire), and its refresh tokens stop carrying the scope from their next rotation. The app stays authorized; signing in again with the scope asks for consent again. Idempotent.",
  tags: [API_TAGS.account],
  auth: requireAuth({ schemes: sessionSchemes }),
  request: { params },
  responses: {
    200: { description: "The scope is no longer granted", schema: ApiScopeConsentRevocationResponse },
    ...validationErrorResponse,
    ...sessionErrorResponses,
    500: { description: "Failed to withdraw the scope", schema: ErrorResponse },
  },
  handler: async (ctx) => {
    const user = ctx.auth.user;
    const { db } = ctx.context;
    const { app_id, api_server_scope_id } = ctx.params;
    try {
      const { revoked, revoked_token_count } = await db.transaction().execute(async (trx) => {
        const revoked = await revokeApiScopeConsent(trx, {
          uid: user.uid,
          client_app_id: app_id,
          api_server_scope_id,
        });
        const revoked_token_count = revoked
          ? await revokeAccessTokensIssuedToClientAppForAudience(
              trx,
              user.uid,
              app_id,
              revoked.api_server_id,
            )
          : 0;
        return { revoked, revoked_token_count };
      });
      return ctx.json(200, {
        success: true,
        message: revoked
          ? `Withdrew '${revoked.scope}' from the application`
          : "The scope was not granted to the application",
        was_granted: revoked !== null,
        revoked_token_count,
      });
    } catch (e: unknown) {
      await captureServerException(db, e, {
        op_name: "DELETE_revoke_my_app_scope_consent",
        route: ROUTE,
        uid: user.uid,
        context: { app_id, api_server_scope_id },
      });
      return ctx.json(500, { success: false, message: "Failed to withdraw the scope" });
    }
  },
});
