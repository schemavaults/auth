import { requireAuth } from "@schemavaults/openapi-operations";
import { defineOperation } from "@/lib/api/context";
import { sessionSchemes } from "@/lib/api/auth-schemes";
import {
  ClientSecretMetadataResponse,
  appIdParams,
  appManagementErrorResponses,
} from "@/lib/api/domain-schemas/apps";
import { sessionErrorResponses, validationErrorResponse } from "@/lib/api/schemas";
import { API_TAGS } from "@/lib/api/tags";
import { SchemaVaultsAppRegistry } from "@/lib/auth-db/apps";
import captureServerException from "@/lib/captureServerException";
import loadAppForManagement from "@/lib/load-app-for-management";
import { CLIENT_SECRET_ROUTE } from "./client-secret-route";

export const getClientSecretMetadata = defineOperation({
  method: "get",
  path: "/api/apps/{app_id}/client-secret",
  summary: "Get client secret metadata",
  description:
    "Reports whether a client application has a client secret (is a confidential client) and when it was generated / rotated. The secret itself is never retrievable after generation. Requires management access; hardcoded apps cannot be configured.",
  tags: [API_TAGS.apps],
  auth: requireAuth({ schemes: sessionSchemes }),
  request: { params: appIdParams },
  responses: {
    200: { description: "The client secret metadata", schema: ClientSecretMetadataResponse },
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
      route: CLIENT_SECRET_ROUTE,
      op_name: "GET_client_secret_metadata",
    });
    if (!guard.ok) return guard.response;

    try {
      const appRegistry = new SchemaVaultsAppRegistry(db);
      const record = await appRegistry.getClientSecretRecord(app_id);
      if (!record) {
        return ctx.json(200, { success: true, has_client_secret: false });
      }
      return ctx.json(200, {
        success: true,
        has_client_secret: true,
        created_at: record.created_at,
        updated_at: record.updated_at,
      });
    } catch (e: unknown) {
      await captureServerException(db, e, {
        op_name: "GET_client_secret_metadata.getClientSecretRecord",
        route: CLIENT_SECRET_ROUTE,
        uid: user.uid,
        context: { app_id },
      });
      return ctx.json(500, { success: false, message: "Failed to load client secret metadata" });
    }
  },
});
