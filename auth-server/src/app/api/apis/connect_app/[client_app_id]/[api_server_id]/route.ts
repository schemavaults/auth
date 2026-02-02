import "server-only";

import {
  SchemaVaultsAppToApiPermissionsRegistry,
  type ResourceCreationResponse,
} from "@/lib/auth-db";
import { SchemaVaultsAppRegistry } from "@/lib/auth-db/apps";
import { SchemaVaultsApiServerRegistry } from "@/lib/auth-db/apis";
import { OrganizationsRegistry } from "@/lib/auth-db/organizations";
import {
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
  props: { params: Promise<{ client_app_id: string; api_server_id: string }> },
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
        console.log("[/api/apis/connect_app] POST request received");
      }

      // Allow admin access OR organization owner access
      if (!user.admin) {
        const appsRegistry = new SchemaVaultsAppRegistry(dbh.db);
        const apiServerRegistry = new SchemaVaultsApiServerRegistry(dbh.db);
        const organizationsRegistry = new OrganizationsRegistry(dbh.db);

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

        // Both must belong to the same organization
        const appOrgId = app.owner_organization_id;
        const apiOrgId = apiServer.owner_organization_id;

        if (!appOrgId || !apiOrgId || appOrgId !== apiOrgId) {
          return NextResponse.json(
            {
              success: false,
              message: "App and API server must belong to the same organization",
            } satisfies ResourceCreationResponse,
            { status: 403 }
          );
        }

        // User must be owner of that organization
        const userMemberships = await organizationsRegistry.listUserOrganizationMemberships(user.uid, false);
        const userMembership = userMemberships.find(m => m.organization_id === appOrgId);

        if (!userMembership || userMembership.role !== "owner") {
          return NextResponse.json(
            {
              success: false,
              message: "You must be an organization owner to connect apps to API servers",
            } satisfies ResourceCreationResponse,
            { status: 403 }
          );
        }
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
