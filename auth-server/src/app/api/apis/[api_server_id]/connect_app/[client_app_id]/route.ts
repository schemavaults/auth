import "server-only";

import {
  SchemaVaultsAppToApiPermissionsRegistry,
  type ResourceCreationResponse,
} from "@/lib/auth-db";
import { SchemaVaultsAppRegistry } from "@/lib/auth-db/apps";
import { SchemaVaultsApiServerRegistry } from "@/lib/auth-db/apis";
import { OrganizationsRegistry } from "@/lib/auth-db/organizations";
import {
  apiServerIdSchema,
  appIdSchema,
  type AppToApiPermission,
  appToApiPermissionSchema,
} from "@schemavaults/app-definitions";
import { type NextRequest, NextResponse } from "next/server";
import {
  type IProtectedAuthenticatedApiRouteProps,
  withAuthenticatedApiRouteGuard,
} from "@/lib/withAuthenticatedRouteGuard";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import type { ServerRuntime } from "next";

export const runtime: ServerRuntime = "edge"

/**
 * Connect a frontend app client to an API server
 */
export async function POST(
  req: NextRequest,
  props: RouteContext<"/api/apis/[api_server_id]/connect_app/[client_app_id]">,
): Promise<NextResponse> {
  const params = await props.params;

  let client_app_id: string;
  let api_server_id: string;
  try {
    if (
      typeof params !== "object" ||
      !params ||
      !("client_app_id" in params) ||
      typeof params.client_app_id !== "string" ||
      !("api_server_id" in params) ||
      typeof params.api_server_id !== "string"
    ) {
      throw new Error(
        "Failed to load client_app_id and api_server_id from dynamic route segments!",
      );
    }
    if (!(await apiServerIdSchema.safeParseAsync(params.api_server_id)).success) {
      throw new TypeError("Invalid 'api_server_id' parameter!");
    }
    if (!(await appIdSchema.safeParseAsync(params.client_app_id)).success) {
      throw new TypeError("Invalid 'client_app_id' parameter!")
    }
    client_app_id = params.client_app_id;
    api_server_id = params.api_server_id;
  } catch (e: unknown) {
    console.error("Failed to parse route params: ", e);
    return NextResponse.json(
      {
        success: false,
        message: "Failed to parse route parameters",
      } satisfies ResourceCreationResponse,
      {
        status: 400,
      },
    );
  }

  const protected_route = await withAuthenticatedApiRouteGuard(
    async ({
      user,
      dbh,
      environment,
    }: IProtectedAuthenticatedApiRouteProps<AuthDatabase>): Promise<NextResponse> => {
      if (environment === "development") {
        console.log(`[/api/apis/${api_server_id}/connect_app/${client_app_id}] POST request received`);
      }

      if (!user) {
        return NextResponse.json(
          {
            success: false,
            message: "Failed to determine authentication status!",
          } satisfies ResourceCreationResponse,
          { status: 401 }
        );
      }

      const appsRegistry = new SchemaVaultsAppRegistry(dbh.db);
      const apiServerRegistry = new SchemaVaultsApiServerRegistry(dbh.db);

      // Load app and API server
      const [app, apiServer] = await Promise.all([
        appsRegistry.getApp(client_app_id),
        apiServerRegistry.getApiServer(api_server_id),
      ]);

      if (!app) {
        return NextResponse.json(
          {
            success: false,
            message: "App not found",
          } satisfies ResourceCreationResponse,
          { status: 404 }
        );
      }
      if (!apiServer) {
        return NextResponse.json(
          {
            success: false,
            message: "API server not found",
          } satisfies ResourceCreationResponse,
          { status: 404 }
        );
      }

      // Allow admin access OR organization owner access
      if (!user.admin) {
        const organizationsRegistry = new OrganizationsRegistry(dbh.db);
        const userMemberships = await organizationsRegistry.listUserOrganizationMemberships(
          user.uid,
          false
        );

        const appOrgId = app.owner_organization_id;
        const apiOrgId = apiServer.owner_organization_id;

        if (!appOrgId || !apiOrgId) {
          return NextResponse.json(
            {
              success: false,
              message: "App and API server must belong to non-admin organizations if you are not an admin.",
            } satisfies ResourceCreationResponse,
            { status: 403 }
          );
        }

        const userOwnsApp: boolean = userMemberships.some(m => m.organization_id === appOrgId && m.role === 'owner');
        const userOwnsApi: boolean = userMemberships.some(m => m.organization_id === apiOrgId && m.role === 'owner');

        if (!userOwnsApp || !userOwnsApi) {
          return NextResponse.json(
            {
              success: false,
              message: "You must have 'owner' role of the organization(s) that own the app & api server to connect them!",
            } satisfies ResourceCreationResponse,
            { status: 403 }
          );
        }
      }

      // PERMISSION HAS BEEN VALIDATED IF THIS POINT REACHED
      if (environment === "development") {
        console.log(`[/api/apis/${api_server_id}/connect_app/${client_app_id}] User has permission to connect app to api!`);
      }

      let newPermission: AppToApiPermission;
      try {
        const parsed = await appToApiPermissionSchema.safeParseAsync({
          api_server_id,
          client_app_id,
          created_at: Date.now(),
        } satisfies AppToApiPermission);
        if (!parsed.success) throw parsed.error;
        newPermission = parsed.data;
      } catch (e: unknown) {
        const errorMessage =
          "Failed to parse which app to connect to which API server";
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

      const appsToApiPermissionsRegistry: SchemaVaultsAppToApiPermissionsRegistry =
        new SchemaVaultsAppToApiPermissionsRegistry(dbh.db);

      try {
        await appsToApiPermissionsRegistry.allow(
          newPermission.client_app_id,
          newPermission.api_server_id,
        );

        return NextResponse.json({
          success: true,
          message: "Successfully conected frontend application to API server",
          resource_id: newPermission.api_server_id,
        } satisfies ResourceCreationResponse);
      } catch (e: unknown) {
        console.error("Failed to connect app to API server: ", e);
        return NextResponse.json(
          {
            success: false,
            message: "Failed to connect app to API server",
          } satisfies ResourceCreationResponse,
          {
            status: 500,
          },
        );
      }
    },
  );

  return await protected_route(req);
}

export const dynamic = "force-dynamic"; // defaults to auto
