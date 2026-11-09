import { apiServerIdSchema, appIdSchema } from "@schemavaults/app-definitions";
import { updateAppApiConnectionFirstPartyRequestSchema } from "@schemavaults/auth-common";
import { z, requireAuth, withOpenApi } from "@schemavaults/openapi-operations";
import { defineOperation } from "@/lib/api/context";
import { sessionSchemes } from "@/lib/api/auth-schemes";
import { ErrorResponse, sessionErrorResponses, validationErrorResponse } from "@/lib/api/schemas";
import { API_TAGS } from "@/lib/api/tags";
import {
  AppNotConnectedForScopesError,
  isFirstPartyAppApiConnection,
  setFirstPartyAppApiConnection,
} from "@/lib/auth-db/apis";
import captureServerException from "@/lib/captureServerException";
import { checkConnectionPolicyAccess } from "../connection-policy-access";

const ROUTE = "/api/apis/{api_server_id}/connect_app/{client_app_id}/first-party";

const params = z.object({
  api_server_id: withOpenApi(apiServerIdSchema, { description: "API server id", example: "my-resource-api" }),
  client_app_id: withOpenApi(appIdSchema, { description: "Client application id", example: "my-web-app" }),
});

const FIRST_PARTY_DESCRIPTION =
  "Whether the connection is first-party: the app and the API server belong to the same party, so users signing in to the app for the API server (the authorization request's RFC 8707 `resource`) consent implicitly. Such requests get the API scopes they ask for, among those the app may be granted (the connection's scope allowances still apply), without the consent screen; the app authorization and the scope consents are recorded when the authorization code is minted, so they appear on the user's third-party access page, where the user can still withdraw them (signing in again records them again). `prompt=consent` still shows the consent screen. Requests that ask for none of the API server's scopes are unaffected.";

const AppApiConnectionFirstPartyResponse = z
  .object({
    success: z.literal(true),
    first_party: z.boolean().openapi({ description: FIRST_PARTY_DESCRIPTION }),
  })
  .openapi("AppApiConnectionFirstPartyResponse");

const UpdateAppApiConnectionFirstPartyRequest = withOpenApi(
  updateAppApiConnectionFirstPartyRequestSchema,
  "UpdateAppApiConnectionFirstPartyRequest",
  {
    description:
      "Marks the connection first-party (`true`) or not (`false`). Unknown keys are rejected.",
  },
);

export const getAppApiConnectionFirstPartyOperation = defineOperation({
  method: "get",
  path: ROUTE,
  summary: "Get whether an app-to-API connection is first-party",
  description: `${FIRST_PARTY_DESCRIPTION} Off by default.`,
  tags: [API_TAGS.apis],
  auth: requireAuth({
    schemes: sessionSchemes,
    notes:
      "Organization owners/admins (or the owning user) of the API server or of the app, or platform administrators.",
  }),
  request: { params },
  responses: {
    200: { description: "Whether the connection is first-party", schema: AppApiConnectionFirstPartyResponse },
    // 400: malformed ids, or a hardcoded API server (they define no API scopes)
    ...validationErrorResponse,
    ...sessionErrorResponses,
    404: { description: "No such app or API server, or they are not connected", schema: ErrorResponse },
    500: { description: "Failed to load the connection", schema: ErrorResponse },
  },
  handler: async (ctx) => {
    const user = ctx.auth.user;
    const { db } = ctx.context;
    const { api_server_id, client_app_id } = ctx.params;
    const access = await checkConnectionPolicyAccess(db, user, api_server_id, client_app_id, "view", {
      view: "You must be able to manage the API server or the app to view whether their connection is first-party",
      manage: "You must be able to manage the API server to view whether its connection is first-party",
    });
    if (!access.ok) {
      return ctx.json(access.status, { success: false, message: access.message });
    }
    try {
      const first_party = await isFirstPartyAppApiConnection(db, client_app_id, api_server_id);
      return ctx.json(200, { success: true, first_party });
    } catch (e: unknown) {
      await captureServerException(db, e, {
        op_name: "GET_app_api_connection_first_party",
        route: ROUTE,
        uid: user.uid,
        context: { api_server_id, client_app_id },
      });
      return ctx.json(500, { success: false, message: "Failed to load the connection" });
    }
  },
});

export const setAppApiConnectionFirstPartyOperation = defineOperation({
  method: "put",
  path: ROUTE,
  summary: "Mark an app-to-API connection first-party",
  description: `${FIRST_PARTY_DESCRIPTION} Platform administrators only: skipping the consent screen is a statement that the app may act for every user on the API server without asking them, which neither the API server's nor the app's managers can make for themselves. Turning it off does not withdraw the consents already recorded through it; users are asked for anything new.`,
  tags: [API_TAGS.apis],
  auth: requireAuth({ schemes: sessionSchemes, routeGuard: "admin" }),
  request: {
    params,
    body: { lenientContentType: true, schema: UpdateAppApiConnectionFirstPartyRequest },
  },
  responses: {
    200: { description: "Whether the connection is now first-party", schema: AppApiConnectionFirstPartyResponse },
    // 400: malformed body or ids, or a hardcoded API server (they define no API scopes)
    ...validationErrorResponse,
    401: sessionErrorResponses[401],
    403: { description: "The caller is not a platform administrator", schema: ErrorResponse },
    404: { description: "No such app or API server, or they are not connected", schema: ErrorResponse },
    500: { description: "Failed to update the connection", schema: ErrorResponse },
  },
  handler: async (ctx) => {
    const user = ctx.auth.user;
    const { db } = ctx.context;
    const { api_server_id, client_app_id } = ctx.params;
    // The route guard already requires a platform administrator; this
    // checks the resources exist and are connected.
    const access = await checkConnectionPolicyAccess(db, user, api_server_id, client_app_id, "manage", {
      view: "Only platform administrators may mark a connection first-party",
      manage: "Only platform administrators may mark a connection first-party",
    });
    if (!access.ok) {
      return ctx.json(access.status, { success: false, message: access.message });
    }
    try {
      const first_party = await setFirstPartyAppApiConnection(db, {
        client_app_id,
        api_server_id,
        first_party: ctx.body.first_party,
        updated_by: user.uid,
      });
      return ctx.json(200, { success: true, first_party });
    } catch (e: unknown) {
      if (e instanceof AppNotConnectedForScopesError) {
        return ctx.json(404, { success: false, message: "The app is not connected to the API server" });
      }
      await captureServerException(db, e, {
        op_name: "PUT_app_api_connection_first_party",
        route: ROUTE,
        uid: user.uid,
        context: { api_server_id, client_app_id },
      });
      return ctx.json(500, { success: false, message: "Failed to update the connection" });
    }
  },
});
