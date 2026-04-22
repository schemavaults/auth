import "server-only";

import { applyCorsHeadersForSchemaVaultsWeb } from "@/lib/cors/cors-for-schemavaults-web";
import {
  SchemaVaultsAppToApiPermissionsRegistry,
} from "@/lib/auth-db";
import { SchemaVaultsAppRegistry } from "@/lib/auth-db/apps";
import { SchemaVaultsApiServerRegistry } from "@/lib/auth-db/apis";
import { OrganizationsRegistry } from "@/lib/auth-db/organizations";
import {
  apiServerIdSchema,
  appIdSchema,
  isHardcodedApiServerId,
} from "@schemavaults/app-definitions";
import { type NextRequest, NextResponse } from "next/server";
import {
  type IProtectedAuthenticatedApiRouteProps,
  withAuthenticatedApiRouteGuard,
} from "@/lib/withAuthenticatedRouteGuard";
import captureServerException from "@/lib/captureServerException";

const ROUTE = "/api/apis/[api_server_id]/connect_app/[client_app_id]";

export type GetAppToApiPermissionResponse =
  | { success: true; is_allowed: boolean }
  | { success: false; message: string };

/**
 * Check if a frontend app client has permission to access an API server
 */
export async function GET_app_to_api_permission_handler(
  req: NextRequest,
  ctx: RouteContext<"/api/apis/[api_server_id]/connect_app/[client_app_id]">,
): Promise<NextResponse> {
  const params = await ctx.params;

  const parsed_api_server_id = await apiServerIdSchema.safeParseAsync(
    params.api_server_id,
  );
  if (!parsed_api_server_id.success) {
    return NextResponse.json(
      {
        success: false,
        message: "Invalid api_server_id parameter",
      } satisfies GetAppToApiPermissionResponse,
      { status: 400 },
    );
  }

  const parsed_client_app_id = await appIdSchema.safeParseAsync(
    params.client_app_id,
  );
  if (!parsed_client_app_id.success) {
    return NextResponse.json(
      {
        success: false,
        message: "Invalid client_app_id parameter",
      } satisfies GetAppToApiPermissionResponse,
      { status: 400 },
    );
  }

  const api_server_id = parsed_api_server_id.data;
  const client_app_id = parsed_client_app_id.data;

  const protected_route = await withAuthenticatedApiRouteGuard(
    async ({
      user,
      dbh,
      environment,
    }: IProtectedAuthenticatedApiRouteProps): Promise<NextResponse> => {
      if (environment === "development") {
        console.log(
          `[/api/apis/${api_server_id}/connect_app/${client_app_id}] GET request received`,
        );
      }

      if (!user) {
        return NextResponse.json(
          {
            success: false,
            message: "Failed to determine authentication status!",
          } satisfies GetAppToApiPermissionResponse,
          { status: 401 },
        );
      }

      const appsRegistry = new SchemaVaultsAppRegistry(dbh.db);
      const apiServerRegistry = new SchemaVaultsApiServerRegistry(dbh.db);

      const [app, apiServer] = await Promise.all([
        appsRegistry.getApp(client_app_id),
        apiServerRegistry.getApiServer(api_server_id),
      ]);

      if (!app) {
        return NextResponse.json(
          {
            success: false,
            message: "App not found",
          } satisfies GetAppToApiPermissionResponse,
          { status: 404 },
        );
      }
      if (!apiServer) {
        return NextResponse.json(
          {
            success: false,
            message: "API server not found",
          } satisfies GetAppToApiPermissionResponse,
          { status: 404 },
        );
      }

      // Authorization: same ownership checks as POST
      if (!user.admin) {
        const organizationsRegistry = new OrganizationsRegistry(dbh.db);
        const userMemberships =
          await organizationsRegistry.listUserOrganizationMemberships(
            user.uid,
            false,
          );

        const appOrgId = app.owner_organization_id;
        const apiOrgId = apiServer.owner_organization_id;
        const isHardcoded = isHardcodedApiServerId(api_server_id);
        const isPublicHardcoded = isHardcoded && apiServer.public === true;

        if (!appOrgId) {
          return NextResponse.json(
            {
              success: false,
              message:
                "App must belong to a non-admin organization if you are not an admin.",
            } satisfies GetAppToApiPermissionResponse,
            { status: 403 },
          );
        }

        if (!isPublicHardcoded && !apiOrgId) {
          return NextResponse.json(
            {
              success: false,
              message:
                "App and API server must belong to non-admin organizations if you are not an admin.",
            } satisfies GetAppToApiPermissionResponse,
            { status: 403 },
          );
        }

        const userOwnsApp: boolean = userMemberships.some(
          (m) => m.organization_id === appOrgId && m.role === "owner",
        );

        if (!userOwnsApp) {
          return NextResponse.json(
            {
              success: false,
              message:
                "You must have 'owner' role of the organization that owns the app to check this permission!",
            } satisfies GetAppToApiPermissionResponse,
            { status: 403 },
          );
        }

        if (!isPublicHardcoded) {
          const userOwnsApi: boolean = userMemberships.some(
            (m) => m.organization_id === apiOrgId && m.role === "owner",
          );

          if (!userOwnsApi) {
            return NextResponse.json(
              {
                success: false,
                message:
                  "You must have 'owner' role of the organization(s) that own the app & api server to check this permission!",
              } satisfies GetAppToApiPermissionResponse,
              { status: 403 },
            );
          }
        }
      }

      try {
        const permissionsRegistry =
          new SchemaVaultsAppToApiPermissionsRegistry(dbh.db);
        const is_allowed = await permissionsRegistry.isAllowed(
          client_app_id,
          api_server_id,
        );

        return NextResponse.json({
          success: true,
          is_allowed,
        } satisfies GetAppToApiPermissionResponse);
      } catch (e: unknown) {
        await captureServerException(dbh.db, e, {
          op_name: "GET_app_to_api_permission_handler.isAllowed",
          route: ROUTE,
          uid: user.uid,
          context: { api_server_id, client_app_id },
        });
        return NextResponse.json(
          {
            success: false,
            message: "Failed to check app-to-api permission",
          } satisfies GetAppToApiPermissionResponse,
          { status: 500 },
        );
      }
    },
  );

  const response = await protected_route(req);
  return applyCorsHeadersForSchemaVaultsWeb(response, req);
}

export default GET_app_to_api_permission_handler;
