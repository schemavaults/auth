import "server-only";

import { applyCorsHeadersForSchemaVaultsWeb } from "@/lib/cors/cors-for-schemavaults-web";
import { SchemaVaultsAppRegistry } from "@/lib/auth-db";
import {
  type AppId,
  type SchemaVaultsApp,
  type SchemaVaultsAppDomainRef,
  appIdSchema,
} from "@schemavaults/app-definitions";
import { type NextRequest, NextResponse } from "next/server";
import {
  type IProtectedAuthenticatedApiRouteProps,
  withAuthenticatedApiRouteGuard,
} from "@/lib/withAuthenticatedRouteGuard";
import isUserInOrganization from "@/lib/isUserInOrganization";
import { type OrganizationID } from "@schemavaults/auth-common";

export type ListAppDomainsResponse =
  | {
      success: true;
      message: string;
      list: SchemaVaultsAppDomainRef[];
    }
  | {
      success: false;
      message: string;
    };

/**
 * List available domains for a SchemaVaults app
 */
export async function GET_list_app_domains(
  req: NextRequest,
  ctx: RouteContext<'/api/apps/[app_id]/domains'>,
): Promise<NextResponse> {
  const params = await ctx.params;

  const parsed_app_id = await appIdSchema.safeParseAsync(params.app_id);
  if (!parsed_app_id.success) {
    console.error("Failed to parse frontend app_id: ", parsed_app_id.error);
    return NextResponse.json(
      {
        success: false,
        message: "Invalid frontend app id, not a string",
      } satisfies ListAppDomainsResponse,
      {
        status: 400,
      },
    );
  }
  const app_id: AppId = parsed_app_id.data;

  const protected_route = await withAuthenticatedApiRouteGuard(
    async ({
      user,
      dbh,
      environment,
    }: IProtectedAuthenticatedApiRouteProps): Promise<NextResponse> => {
      if (environment === "development") {
        console.log(`[/api/apps/${app_id}/domains] GET request received`);
      }

      let apps: SchemaVaultsAppRegistry;
      try {
        apps = new SchemaVaultsAppRegistry(dbh.db);
      } catch (e: unknown) {
        console.error(e);
        return NextResponse.json(
          {
            success: false,
            message: "Failed to connect to apps registry",
          } satisfies ListAppDomainsResponse,
          {
            status: 500,
          },
        );
      }

      let app: SchemaVaultsApp;
      try {
        const loadAppQuery = await apps.getApp(app_id);
        if (!loadAppQuery) {
          throw new Error(`No app found with app_id ${app_id}`);
        }
        app = loadAppQuery;
      } catch (e: unknown) {
        console.error(
          "Failed to load SchemaVaults app with given 'app_id': ",
          e,
        );
        return NextResponse.json(
          {
            success: false,
            message: "Failed to load SchemaVaults app with given 'app_id'",
          } satisfies ListAppDomainsResponse,
          {
            status: 404,
          },
        );
      }

      if (!app.public && !user.admin) {
        let authorized = false;
        if (app.owner_organization_id) {
          authorized = await isUserInOrganization(
            user,
            app.owner_organization_id as OrganizationID,
            dbh.db,
          );
        }
        if (!authorized) {
          console.error("Non-public apps are currently reserved for admins!");
          return NextResponse.json(
            {
              success: false,
              message: "You are not authorized to list domains for this app",
            } satisfies ListAppDomainsResponse,
            {
              status: 403,
            },
          );
        }
      }

      try {
        const domains = await apps.getAppDomains(app_id);
        return NextResponse.json({
          success: true,
          message: "Domains successfully listed",
          list: domains,
        } satisfies ListAppDomainsResponse);
      } catch (e: unknown) {
        console.error("Failed to list domains for SchemaVaults app: ", e);
        return NextResponse.json(
          {
            success: false,
            message: "Failed to list domains for SchemaVaults app",
          } satisfies ListAppDomainsResponse,
          {
            status: 500,
          },
        );
      }
    },
  );

  const response = await protected_route(req);
  return applyCorsHeadersForSchemaVaultsWeb(response, req);
}

export default GET_list_app_domains;
