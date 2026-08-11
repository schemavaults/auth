import "server-only";

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
import captureServerException from "@/lib/captureServerException";

const ROUTE = "/api/apps/[app_id]";

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
  // Params are parsed inside the guard so unauthenticated callers get a
  // 401 without observing whether the app id was well-formed.
  const protected_route = await withAuthenticatedApiRouteGuard(
    async ({
      user,
      dbh,
      environment,
    }: IProtectedAuthenticatedApiRouteProps): Promise<NextResponse> => {
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

      if (environment === "development") {
        console.log(`[/api/apps/${app_id}] GET request received`);
      }

      let apps: SchemaVaultsAppRegistry;
      try {
        apps = new SchemaVaultsAppRegistry(dbh.db);
      } catch (e: unknown) {
        await captureServerException(dbh.db, e, {
          op_name: "GET_app_handler.loadAppsRegistry",
          route: ROUTE,
          uid: user.uid,
          context: { app_id },
        });
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
        await captureServerException(dbh.db, e, {
          op_name: "GET_app_handler.getApp",
          route: ROUTE,
          uid: user.uid,
          context: { app_id },
        });
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
        let authorized: boolean = false;
        if (app.owner_organization_id) {
          const role = await isUserInOrganization(
            dbh.db,
            user,
            app.owner_organization_id as OrganizationID,
          )
          if (role === 'admin' || role === 'owner' || role === 'member') {
            authorized = true;
          }
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

  return await protected_route(req);
}

export default GET_app_handler;
