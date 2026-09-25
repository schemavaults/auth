import { requireAuth } from "@schemavaults/openapi-operations";
import { defineOperation } from "@/lib/api/context";
import { sessionSchemes } from "@/lib/api/auth-schemes";
import {
  AppServiceAccountResponse,
  appIdParams,
  appManagementErrorResponses,
} from "@/lib/api/domain-schemas/apps";
import { sessionErrorResponses, validationErrorResponse } from "@/lib/api/schemas";
import { API_TAGS } from "@/lib/api/tags";
import { SchemaVaultsAppRegistry } from "@/lib/auth-db/apps";
import captureServerException from "@/lib/captureServerException";
import loadAppForManagement from "@/lib/load-app-for-management";
import { SERVICE_ACCOUNT_ROUTE, summarizeServiceAccount } from "./service-account-summary";

export const getAppServiceAccount = defineOperation({
  method: "get",
  path: "/api/apps/{app_id}/service-account",
  summary: "Get an app's service account",
  description:
    "Returns the client application's service account (the machine identity `grant_type=client_credentials` tokens are minted for), if any, and whether the app is currently a confidential client, i.e. eligible for that grant. Requires management access; hardcoded apps cannot be configured.",
  tags: [API_TAGS.apps],
  auth: requireAuth({ schemes: sessionSchemes }),
  request: { params: appIdParams },
  responses: {
    200: { description: "The service account (or null) and the app's client secret status", schema: AppServiceAccountResponse },
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
      op_name: "GET_service_account",
    });
    if (!guard.ok) return guard.response;

    try {
      const appRegistry = new SchemaVaultsAppRegistry(db);
      const [service_account, secret] = await Promise.all([
        appRegistry.getServiceAccount(app_id),
        appRegistry.getClientSecretRecord(app_id),
      ]);
      return ctx.json(200, {
        success: true,
        service_account: service_account ? summarizeServiceAccount(service_account) : null,
        has_client_secret: secret !== null,
      });
    } catch (e: unknown) {
      await captureServerException(db, e, {
        op_name: "GET_service_account.getServiceAccount",
        route: SERVICE_ACCOUNT_ROUTE,
        uid: user.uid,
        context: { app_id },
      });
      return ctx.json(500, { success: false, message: "Failed to load service account" });
    }
  },
});
