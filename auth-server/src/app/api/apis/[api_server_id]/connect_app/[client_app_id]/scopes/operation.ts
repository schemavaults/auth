import {
  apiServerIdSchema,
  appIdSchema,
  isHardcodedApiServerId,
} from "@schemavaults/app-definitions";
import {
  appApiScopePolicySchema,
  updateAppApiScopePolicyRequestSchema,
  type UserData,
} from "@schemavaults/auth-common";
import type { Kysely } from "@schemavaults/dbh";
import { z, requireAuth, withOpenApi } from "@schemavaults/openapi-operations";
import { defineOperation } from "@/lib/api/context";
import { sessionSchemes } from "@/lib/api/auth-schemes";
import { ErrorResponse, sessionErrorResponses, validationErrorResponse } from "@/lib/api/schemas";
import { API_TAGS } from "@/lib/api/tags";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import {
  AppNotConnectedForScopesError,
  SchemaVaultsApiServerRegistry,
  UnknownApiScopesError,
  getAppApiScopePolicy,
  setAppApiScopePolicy,
} from "@/lib/auth-db/apis";
import { SchemaVaultsAppRegistry } from "@/lib/auth-db/apps";
import { SchemaVaultsAppToApiPermissionsRegistry } from "@/lib/auth-db";
import captureServerException from "@/lib/captureServerException";
import { canUserManageResource } from "@/lib/ownership/resource-access";

const ROUTE = "/api/apis/{api_server_id}/connect_app/{client_app_id}/scopes";

const params = z.object({
  api_server_id: withOpenApi(apiServerIdSchema, { description: "API server id", example: "my-resource-api" }),
  client_app_id: withOpenApi(appIdSchema, { description: "Client application id", example: "my-web-app" }),
});

export const AppApiScopePolicy = withOpenApi(appApiScopePolicySchema, "AppApiScopePolicy", {
  description:
    "Which of the API server's scopes the connected app may be granted. `restrict_user_scopes` false (the default): users may grant the app every scope the API server defines (each user still consents per scope); true: only `user_scopes`. `service_account_scopes`: the scopes the app's own service account gets on the client_credentials grant, where no user consents (none by default).",
});

const AppApiScopePolicyResponse = z
  .object({ success: z.literal(true), policy: AppApiScopePolicy })
  .openapi("AppApiScopePolicyResponse");

const UpdateAppApiScopePolicyRequest = withOpenApi(
  updateAppApiScopePolicyRequestSchema,
  "UpdateAppApiScopePolicyRequest",
  {
    description:
      "Replaces the connection's scope allowances. Every value must be a scope the API server defines; lists hold unique values. Unknown keys are rejected.",
  },
);

type ScopePolicyAccess =
  | { ok: true }
  | { ok: false; status: 400 | 403 | 404; message: string };

/**
 * Viewing needs management access to either side (the API server decides
 * what the app may get; the app's managers may see it); changing needs
 * management access to the API server. The app must be connected.
 */
async function checkAccess(
  db: Kysely<AuthDatabase>,
  user: UserData,
  api_server_id: string,
  client_app_id: string,
  access: "view" | "manage",
): Promise<ScopePolicyAccess> {
  const [apiServer, app] = await Promise.all([
    new SchemaVaultsApiServerRegistry(db).getApiServer(api_server_id),
    new SchemaVaultsAppRegistry(db).getApp(client_app_id),
  ]);
  if (!apiServer) return { ok: false, status: 404, message: "API server not found" };
  if (!app) return { ok: false, status: 404, message: "App not found" };
  if (isHardcodedApiServerId(api_server_id)) {
    return { ok: false, status: 400, message: "Hardcoded API servers define no API scopes" };
  }
  if (!user.admin) {
    const managesApi = await canUserManageResource(db, user, apiServer);
    const allowed =
      access === "manage" ? managesApi : managesApi || (await canUserManageResource(db, user, app));
    if (!allowed) {
      return {
        ok: false,
        status: 403,
        message:
          access === "manage"
            ? "You must be able to manage the API server to change the scopes its connected apps may be granted"
            : "You must be able to manage the API server or the app to view its scope allowances",
      };
    }
  }
  const connected = await new SchemaVaultsAppToApiPermissionsRegistry(db).isAllowed(
    client_app_id,
    api_server_id,
  );
  if (!connected) {
    return { ok: false, status: 404, message: "The app is not connected to the API server" };
  }
  return { ok: true };
}

function refuse(ctx: { json: (status: 400 | 403 | 404, body: { success: false; message: string }) => Response }, access: Exclude<ScopePolicyAccess, { ok: true }>): Response {
  return ctx.json(access.status, { success: false, message: access.message });
}

export const getAppApiScopePolicyOperation = defineOperation({
  method: "get",
  path: ROUTE,
  summary: "Get a connected app's API scope allowances",
  description:
    "Which of the API server's scopes the connected client application may be granted: on behalf of users (all of them unless restricted) and for its own service account on the client_credentials grant (none unless listed).",
  tags: [API_TAGS.apis],
  auth: requireAuth({
    schemes: sessionSchemes,
    notes:
      "Organization owners/admins (or the owning user) of the API server or of the app, or platform administrators.",
  }),
  request: { params },
  responses: {
    200: { description: "The scope allowances", schema: AppApiScopePolicyResponse },
    ...validationErrorResponse,
    ...sessionErrorResponses,
    404: { description: "No such app or API server, or they are not connected", schema: ErrorResponse },
    500: { description: "Failed to load the scope allowances", schema: ErrorResponse },
  },
  handler: async (ctx) => {
    const user = ctx.auth.user;
    const { db } = ctx.context;
    const { api_server_id, client_app_id } = ctx.params;
    const access = await checkAccess(db, user, api_server_id, client_app_id, "view");
    if (!access.ok) return refuse(ctx, access);
    try {
      const policy = await getAppApiScopePolicy(db, client_app_id, api_server_id);
      return ctx.json(200, { success: true, policy });
    } catch (e: unknown) {
      await captureServerException(db, e, {
        op_name: "GET_app_api_scope_policy",
        route: ROUTE,
        uid: user.uid,
        context: { api_server_id, client_app_id },
      });
      return ctx.json(500, { success: false, message: "Failed to load the scope allowances" });
    }
  },
});

export const updateAppApiScopePolicyOperation = defineOperation({
  method: "put",
  path: ROUTE,
  summary: "Set a connected app's API scope allowances",
  description:
    "Replaces which of the API server's scopes the connected client application may be granted. Restricting the user allowance, or removing a scope from it, also stops already-issued refresh tokens from carrying the removed scopes on their next rotation; a service-account scope applies from the app's next client_credentials grant.",
  tags: [API_TAGS.apis],
  auth: requireAuth({
    schemes: sessionSchemes,
    notes:
      "Organization owners/admins of the API server's owning organization, its owning user, or platform administrators.",
  }),
  request: {
    params,
    body: { lenientContentType: true, schema: UpdateAppApiScopePolicyRequest },
  },
  responses: {
    200: { description: "The updated scope allowances", schema: AppApiScopePolicyResponse },
    // 400: malformed body, scopes the API server does not define, or a hardcoded API server
    ...validationErrorResponse,
    ...sessionErrorResponses,
    404: { description: "No such app or API server, or they are not connected", schema: ErrorResponse },
    500: { description: "Failed to update the scope allowances", schema: ErrorResponse },
  },
  handler: async (ctx) => {
    const user = ctx.auth.user;
    const { db } = ctx.context;
    const { api_server_id, client_app_id } = ctx.params;
    const access = await checkAccess(db, user, api_server_id, client_app_id, "manage");
    if (!access.ok) return refuse(ctx, access);
    try {
      const policy = await setAppApiScopePolicy(db, {
        client_app_id,
        api_server_id,
        restrict_user_scopes: ctx.body.restrict_user_scopes,
        user_scopes: ctx.body.user_scopes,
        service_account_scopes: ctx.body.service_account_scopes,
        updated_by: user.uid,
      });
      return ctx.json(200, { success: true, policy });
    } catch (e: unknown) {
      if (e instanceof UnknownApiScopesError) {
        return ctx.json(400, { success: false, message: e.message });
      }
      if (e instanceof AppNotConnectedForScopesError) {
        return ctx.json(404, { success: false, message: "The app is not connected to the API server" });
      }
      await captureServerException(db, e, {
        op_name: "PUT_app_api_scope_policy",
        route: ROUTE,
        uid: user.uid,
        context: { api_server_id, client_app_id },
      });
      return ctx.json(500, { success: false, message: "Failed to update the scope allowances" });
    }
  },
});
