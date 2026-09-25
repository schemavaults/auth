import { requireAuth } from "@schemavaults/openapi-operations";
import { defineOperation } from "@/lib/api/context";
import { sessionSchemes } from "@/lib/api/auth-schemes";
import {
  AppServiceAccountCreationResponse,
  appIdParams,
  appManagementErrorResponses,
} from "@/lib/api/domain-schemas/apps";
import { sessionErrorResponses, validationErrorResponse } from "@/lib/api/schemas";
import { API_TAGS } from "@/lib/api/tags";
import { SchemaVaultsAppRegistry } from "@/lib/auth-db/apps";
import captureServerException from "@/lib/captureServerException";
import loadAppForManagement from "@/lib/load-app-for-management";
import { SERVICE_ACCOUNT_ROUTE, summarizeServiceAccount } from "./service-account-summary";

export const createAppServiceAccount = defineOperation({
  method: "post",
  path: "/api/apps/{app_id}/service-account",
  summary: "Create an app's service account",
  description:
    "Creates the client application's service account ahead of its first client_credentials grant, so its uid can be granted permissions on resource servers up front. Idempotent: an existing service account is returned with `created: false` and status 200. Requires management access; hardcoded apps cannot be configured.",
  tags: [API_TAGS.apps],
  auth: requireAuth({ schemes: sessionSchemes }),
  request: { params: appIdParams },
  responses: {
    200: { description: "The app already had a service account", schema: AppServiceAccountCreationResponse },
    201: { description: "The service account was created", schema: AppServiceAccountCreationResponse },
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
      route: SERVICE_ACCOUNT_ROUTE,
      op_name: "POST_create_service_account",
    });
    if (!guard.ok) return guard.response;

    try {
      const appRegistry = new SchemaVaultsAppRegistry(db);
      const { user: service_account, created } = await appRegistry.getOrCreateServiceAccount(app_id);
      const body = {
        success: true as const,
        message: created
          ? "Service account created. Machine-to-machine tokens obtained with the client credentials grant are issued to it."
          : "This app already has a service account.",
        service_account: summarizeServiceAccount(service_account),
        created,
      };
      return created ? ctx.json(201, body) : ctx.json(200, body);
    } catch (e: unknown) {
      await captureServerException(db, e, {
        op_name: "POST_create_service_account.getOrCreateServiceAccount",
        route: SERVICE_ACCOUNT_ROUTE,
        uid: user.uid,
        context: { app_id },
      });
      return ctx.json(500, { success: false, message: "Failed to create service account" });
    }
  },
});
