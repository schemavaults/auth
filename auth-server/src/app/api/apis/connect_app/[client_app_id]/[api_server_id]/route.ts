import "server-only";

import {
  SchemaVaultsAppToApiPermissionsRegistry,
  type ResourceCreationResponse,
} from "@/lib/auth-db";
import {
  type AppToApiPermission,
  appToApiPermissionSchema,
} from "@schemavaults/app-definitions";
import { type NextRequest, NextResponse } from "next/server";
import {
  type IProtectedAuthenticatedApiRouteProps,
  withAuthenticatedApiRouteGuard,
} from "@/lib/withAuthenticatedRouteGuard";

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

  const protected_route = withAuthenticatedApiRouteGuard(
    async ({
      user,
      dbh,
      environment,
    }: IProtectedAuthenticatedApiRouteProps): Promise<NextResponse> => {
      if (environment === "development") {
        console.log("[/api/apis/connect_app] POST request received");
      }

      if (!user.admin) {
        return NextResponse.json(
          {
            success: false,
            message: "You must be an admin to connect an app to an API server",
          } satisfies ResourceCreationResponse,
          {
            status: 403,
          },
        );
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
