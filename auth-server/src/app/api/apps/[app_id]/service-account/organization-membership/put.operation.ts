import { requireAuth } from "@schemavaults/openapi-operations";
import { defineOperation } from "@/lib/api/context";
import { sessionSchemes } from "@/lib/api/auth-schemes";
import {
  AppServiceAccountOrganizationMembershipResponse,
  SetAppServiceAccountOrganizationMembershipRequest,
  appIdParams,
  appManagementErrorResponses,
} from "@/lib/api/domain-schemas/apps";
import { ErrorResponse, sessionErrorResponses, validationErrorResponse } from "@/lib/api/schemas";
import { API_TAGS } from "@/lib/api/tags";
import { SchemaVaultsAppRegistry } from "@/lib/auth-db/apps";
import captureServerException from "@/lib/captureServerException";
import loadAppForManagement from "@/lib/load-app-for-management";
import {
  owningOrganizationIdOfApp,
  summarizeServiceAccountOrganizationMembership,
} from "../service-account-summary";
import { SERVICE_ACCOUNT_ORGANIZATION_MEMBERSHIP_ROUTE } from "./shared";

export const setAppServiceAccountOrganizationMembership = defineOperation({
  method: "put",
  path: "/api/apps/{app_id}/service-account/organization-membership",
  summary: "Make an app's service account a member of its organization",
  description:
    "Makes the service account of an organization-owned client application a member of the organization that owns the app, with the given role (default `member`), or changes its role. Service accounts cannot accept invitations, so this is how the machine identity behind the app's `client_credentials` tokens passes organization membership checks, such as the `required_organization` / `organization` route guards of resource servers built on `@schemavaults/auth-server-sdk` (they ask `GET /api/resource-server/organizations/{organization_id}/members/{uid}/role`). The membership follows the app's owner and does not count against the organization membership limit. The service account must exist (create it with `POST /api/apps/{app_id}/service-account` first); removing it clears the membership, so a recreated service account starts outside the organization. Requires management access; hardcoded apps cannot be configured.",
  tags: [API_TAGS.apps],
  auth: requireAuth({ schemes: sessionSchemes }),
  request: {
    params: appIdParams,
    body: { lenientContentType: true, schema: SetAppServiceAccountOrganizationMembershipRequest },
  },
  responses: {
    200: {
      description: "The service account is now a member of the organization that owns the app, with the given role",
      schema: AppServiceAccountOrganizationMembershipResponse,
    },
    ...validationErrorResponse,
    ...sessionErrorResponses,
    ...appManagementErrorResponses,
    409: {
      description:
        "The app is not owned by an organization (platform-owned, user-owned or dynamically registered), or has no service account yet",
      schema: ErrorResponse,
    },
  },
  handler: async (ctx) => {
    const user = ctx.auth.user;
    const { db, dbh } = ctx.context;
    const { app_id } = ctx.params;
    const { role } = ctx.body;

    const guard = await loadAppForManagement({
      app_id,
      user,
      dbh,
      route: SERVICE_ACCOUNT_ORGANIZATION_MEMBERSHIP_ROUTE,
      op_name: "PUT_service_account_organization_membership",
    });
    if (!guard.ok) return guard.response;

    const organization_id: string | null = owningOrganizationIdOfApp(guard.app);
    if (organization_id === null) {
      return ctx.json(409, {
        success: false,
        message:
          "Only the service account of an app owned by an organization can be a member of an organization; this app is not owned by one.",
      });
    }

    try {
      const appRegistry = new SchemaVaultsAppRegistry(db);
      if (!(await appRegistry.getServiceAccount(app_id))) {
        return ctx.json(409, {
          success: false,
          message:
            "This app has no service account yet: create it first, then make it a member of the organization.",
        });
      }
      await appRegistry.setServiceAccountOrganizationRole(app_id, role, user.uid);
      return ctx.json(200, {
        success: true,
        message: `The app's service account is now ${role === "owner" ? "an owner" : "a member"} of organization '${organization_id}'.`,
        organization_membership: summarizeServiceAccountOrganizationMembership(guard.app, { role }),
      });
    } catch (e: unknown) {
      await captureServerException(db, e, {
        op_name: "PUT_service_account_organization_membership.setServiceAccountOrganizationRole",
        route: SERVICE_ACCOUNT_ORGANIZATION_MEMBERSHIP_ROUTE,
        uid: user.uid,
        context: { app_id, organization_id, role },
      });
      return ctx.json(500, {
        success: false,
        message: "Failed to update the service account's organization membership",
      });
    }
  },
});
