import "server-only";

import {
  SchemaVaultsAppToApiPermissionsRegistry,
} from "@/lib/auth-db";
import { SchemaVaultsAppRegistry } from "@/lib/auth-db/apps";
import { SchemaVaultsApiServerRegistry } from "@/lib/auth-db/apis";
import { isUserOwnerOfResource } from "@/lib/ownership/resource-access";
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
  // Params are parsed inside the guard so unauthenticated callers get a
  // 401 without observing whether the path parameters were well-formed.
  const protected_route = await withAuthenticatedApiRouteGuard(
    async ({
      user,
      dbh,
      environment,
    }: IProtectedAuthenticatedApiRouteProps): Promise<NextResponse> => {
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
      // Ownership: the caller must own the app (organization owner, the
      // owning user of a user-owned app, or a global admin) and, unless the
      // API server is a public hardcoded one, must own the API server too.
      if (!user.admin) {
        const isHardcoded = isHardcodedApiServerId(api_server_id);
        const isPublicHardcoded = isHardcoded && apiServer.public === true;

        const userOwnsApp: boolean = await isUserOwnerOfResource(dbh.db, user, app);
        if (!userOwnsApp) {
          return NextResponse.json(
            {
              success: false,
              message: "You must own the app (organization owner or owning user) to check this permission for it!",
            } satisfies GetAppToApiPermissionResponse,
            { status: 403 },
          );
        }

        // For non-public hardcoded APIs, require admin (already blocked above since !user.admin)
        // For public hardcoded APIs, only app ownership is needed (checked above)
        // For dynamic APIs, also require API server ownership
        if (!isPublicHardcoded) {
          const userOwnsApi: boolean = await isUserOwnerOfResource(dbh.db, user, apiServer);
          if (!userOwnsApi) {
            return NextResponse.json(
              {
                success: false,
                message: "You must own both the app and the API server (organization owner or owning user) to check this permission for them!",
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

  return await protected_route(req);
}

export default GET_app_to_api_permission_handler;
