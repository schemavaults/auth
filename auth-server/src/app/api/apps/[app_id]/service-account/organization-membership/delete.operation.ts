import { requireAuth } from "@schemavaults/openapi-operations";
import { defineOperation } from "@/lib/api/context";
import { sessionSchemes } from "@/lib/api/auth-schemes";
import {
  AppServiceAccountOrganizationMembershipResponse,
  appIdParams,
  appManagementErrorResponses,
} from "@/lib/api/domain-schemas/apps";
import { ErrorResponse, sessionErrorResponses, validationErrorResponse } from "@/lib/api/schemas";
import { API_TAGS } from "@/lib/api/tags";
import { SchemaVaultsAppRegistry } from "@/lib/auth-db/apps";
import captureServerException from "@/lib/captureServerException";
import loadAppForManagement from "@/lib/load-app-for-management";
import { summarizeServiceAccountOrganizationMembership } from "../service-account-summary";
import { SERVICE_ACCOUNT_ORGANIZATION_MEMBERSHIP_ROUTE } from "./shared";

export const deleteAppServiceAccountOrganizationMembership = defineOperation({
  method: "delete",
  path: "/api/apps/{app_id}/service-account/organization-membership",
  summary: "Remove an app's service account from its organization",
  description:
    "Takes the client application's service account out of the organization that owns the app: organization membership checks (including resource servers' role lookups) no longer find it. Access tokens already issued to it stay valid until they expire. Requires management access; hardcoded apps cannot be configured.",
  tags: [API_TAGS.apps],
  auth: requireAuth({ schemes: sessionSchemes }),
  request: { params: appIdParams },
  responses: {
    200: {
      description: "The service account is no longer a member of the organization",
      schema: AppServiceAccountOrganizationMembershipResponse,
    },
    ...validationErrorResponse,
    ...sessionErrorResponses,
    ...appManagementErrorResponses,
    404: {
      description: "No such app, or the app's service account is not a member of an organization",
      schema: ErrorResponse,
    },
  },
  handler: async (ctx) => {
    const user = ctx.auth.user;
    const { db, dbh } = ctx.context;
    const { app_id } = ctx.params;

    const guard = await loadAppForManagement({
      app_id,
      user,
      dbh,
      route: SERVICE_ACCOUNT_ORGANIZATION_MEMBERSHIP_ROUTE,
      op_name: "DELETE_service_account_organization_membership",
    });
    if (!guard.ok) return guard.response;

    try {
      const appRegistry = new SchemaVaultsAppRegistry(db);
      const deleted: boolean = await appRegistry.deleteServiceAccountOrganizationRole(app_id);
      if (!deleted) {
        return ctx.json(404, {
          success: false,
          message: "This app's service account is not a member of an organization",
        });
      }
      return ctx.json(200, {
        success: true,
        message: "The app's service account is no longer a member of the organization.",
        organization_membership: summarizeServiceAccountOrganizationMembership(guard.app, null),
      });
    } catch (e: unknown) {
      await captureServerException(db, e, {
        op_name: "DELETE_service_account_organization_membership.deleteServiceAccountOrganizationRole",
        route: SERVICE_ACCOUNT_ORGANIZATION_MEMBERSHIP_ROUTE,
        uid: user.uid,
        context: { app_id },
      });
      return ctx.json(500, {
        success: false,
        message: "Failed to update the service account's organization membership",
      });
    }
  },
});
