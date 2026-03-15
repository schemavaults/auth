import "server-only";

import { applyCorsHeadersForSchemaVaultsWeb } from "@/lib/cors/cors-for-schemavaults-web";
import { SchemaVaultsAppRegistry } from "@/lib/auth-db";
import {
  type AppId,
  type SchemaVaultsApp,
  appIdSchema,
} from "@schemavaults/app-definitions";
import { type NextRequest, NextResponse } from "next/server";
import {
  type IProtectedAuthenticatedApiRouteProps,
  withAuthenticatedApiRouteGuard,
} from "@/lib/withAuthenticatedRouteGuard";
import isUserInOrganization from "@/lib/isUserInOrganization";
import { type OrganizationID } from "@schemavaults/auth-common";

export type GetAppResponse =
  | {
      success: true;
      app: SchemaVaultsApp;
    }
  | {
      success: false;
      message: string;
    };

/**
 * Load a single SchemaVaults app by ID
 */
export async function GET_app_handler(
  req: NextRequest,
  ctx: RouteContext<"/api/apps/[app_id]">,
): Promise<NextResponse> {
  const params = await ctx.params;

  const parsed_app_id = await appIdSchema.safeParseAsync(params.app_id);
  if (!parsed_app_id.success) {
    console.error("Failed to parse app_id: ", parsed_app_id.error);
    return NextResponse.json(
      {
        success: false,
        message: "Invalid app_id parameter",
      } satisfies GetAppResponse,
      { status: 400 },
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
        console.log(`[/api/apps/${app_id}] GET request received`);
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
          } satisfies GetAppResponse,
          { status: 500 },
        );
      }

      let app: SchemaVaultsApp | null;
      try {
        app = await apps.getApp(app_id);
      } catch (e: unknown) {
        console.error("Failed to load app: ", e);
        return NextResponse.json(
          {
            success: false,
            message: "Failed to load app",
          } satisfies GetAppResponse,
          { status: 500 },
        );
      }

      if (!app) {
        return NextResponse.json(
          {
            success: false,
            message: "App not found",
          } satisfies GetAppResponse,
          { status: 404 },
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
          return NextResponse.json(
            {
              success: false,
              message: "You are not authorized to view this app",
            } satisfies GetAppResponse,
            { status: 403 },
          );
        }
      }

      return NextResponse.json({
        success: true,
        app,
      } satisfies GetAppResponse);
    },
  );

  const response = await protected_route(req);
  return applyCorsHeadersForSchemaVaultsWeb(response, req);
}

export default GET_app_handler;
