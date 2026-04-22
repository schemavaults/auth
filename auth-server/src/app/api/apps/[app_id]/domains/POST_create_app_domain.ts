import "server-only";

import { applyCorsHeadersForSchemaVaultsWeb } from "@/lib/cors/cors-for-schemavaults-web";
import {
  SchemaVaultsAppRegistry,
  type ResourceCreationResponse,
} from "@/lib/auth-db";
import { ConflictError } from "@/lib/error/ConflictError";
import { OrganizationsRegistry } from "@/lib/auth-db/organizations";
import {
  type AppId,
  appIdSchema,
  type SchemaVaultsAppDomainRef,
  schemaVaultsAppDomainRefSchema,
} from "@schemavaults/app-definitions";
import { type NextRequest, NextResponse } from "next/server";
import { type IProtectedAuthenticatedApiRouteProps, withAuthenticatedApiRouteGuard } from "@/lib/withAuthenticatedRouteGuard";
import captureServerException from "@/lib/captureServerException";

const ROUTE = "/api/apps/[app_id]/domains";

/**
 * Create a new domain for an application
 */
export async function POST_create_app_domain(
  request: NextRequest,
  ctx: RouteContext<'/api/apps/[app_id]/domains'>
): Promise<NextResponse> {
  const params = await ctx.params;

  const parsed_app_id = await appIdSchema.safeParseAsync(params.app_id);
  if (!parsed_app_id.success) {
    console.error("Failed to parse frontend app_id: ", parsed_app_id.error);
    return NextResponse.json(
      {
        success: false,
        message: "Invalid frontend app id",
      },
      {
        status: 400,
      },
    );
  }
  const app_id: AppId = parsed_app_id.data;

  const protected_route = await withAuthenticatedApiRouteGuard(
    async ({ req, user, dbh, environment }: IProtectedAuthenticatedApiRouteProps) => {
      if (environment === "development") {
        console.log(`[/api/apps/${app_id}/domains] POST request received`);
      }

      let appRegistry: SchemaVaultsAppRegistry;
      try {
        appRegistry = new SchemaVaultsAppRegistry(dbh.db);
      } catch (e: unknown) {
        await captureServerException(dbh.db, e, {
          op_name: "POST_create_app_domain.loadAppsRegistry",
          route: ROUTE,
          uid: user.uid,
          context: { app_id },
        });
        return NextResponse.json(
          {
            success: false,
            message: "Failed to connect to app registry",
          } satisfies ResourceCreationResponse,
          {
            status: 500,
          },
        );
      }

      // Authorization: allow global admins, or org owners/admins for apps belonging to their org
      if (!user.admin) {
        let authorized = false;
        try {
          const appData = await appRegistry.getApp(app_id);
          if (appData && appData.owner_organization_id) {
            const orgRegistry = new OrganizationsRegistry(dbh.db);
            const memberships = await orgRegistry.listUserOrganizationMemberships(user.uid, false);
            const membership = memberships.find(m => m.organization_id === appData.owner_organization_id);
            if (membership && (membership.role === "owner" || membership.role === "admin")) {
              authorized = true;
            }
          }
        } catch (e: unknown) {
          await captureServerException(dbh.db, e, {
            op_name: "POST_create_app_domain.checkOrgMembership",
            route: ROUTE,
            uid: user.uid,
            context: { app_id, nonFatal: true },
          });
        }

        if (!authorized) {
          return NextResponse.json(
            {
              success: false,
              message: "You must be an admin or organization owner to add a domain to an application",
            } satisfies ResourceCreationResponse,
            {
              status: 403,
            },
          );
        }
      }

      let newResource: SchemaVaultsAppDomainRef;
      try {
        const parsed = await schemaVaultsAppDomainRefSchema.safeParseAsync(
          await req.json(),
        );
        if (!parsed.success) {
          throw parsed.error;
        }
        newResource = parsed.data;
        if (newResource.app_id !== app_id) {
          throw new Error("App ID in body does not match App ID from route params!")
        }
      } catch (e: unknown) {
        const errorMessage =
          "Failed to parse new SchemaVaults frontend app details from request body";
        console.error(e);
        return NextResponse.json(
          {
            success: false,
            message: errorMessage,
          } satisfies ResourceCreationResponse,
          {
            status: 400,
          },
        );
      }

      try {
        await appRegistry.addAppDomain(newResource.app_id, newResource);

        return NextResponse.json({
          success: true,
          message: "Successfully added domain to app",
          resource_id: newResource.app_id,
        } satisfies ResourceCreationResponse);
      } catch (e: unknown) {
        if (e instanceof ConflictError) {
          return NextResponse.json(
            {
              success: false,
              message: e.message,
            } satisfies ResourceCreationResponse,
            { status: 409 },
          );
        }
        await captureServerException(dbh.db, e, {
          op_name: "POST_create_app_domain.addAppDomain",
          route: ROUTE,
          uid: user.uid,
          context: { app_id },
        });
        return NextResponse.json(
          {
            success: false,
            message: "Failed to add domain to app",
          } satisfies ResourceCreationResponse,
          {
            status: 500,
          },
        );
      }
    },
  );
  const response = await protected_route(request);
  return applyCorsHeadersForSchemaVaultsWeb(response, request);
}

export default POST_create_app_domain;
