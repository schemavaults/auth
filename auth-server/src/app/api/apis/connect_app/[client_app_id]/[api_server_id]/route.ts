import "server-only";

import {
  SchemaVaultsAppToApiPermissionsRegistry,
  ServerlessDatabase,
  type ResourceCreationResponse,
} from "@/lib/auth-db";
import { getAppEnvironment, SCHEMAVAULTS_AUTH_APP_DEFINITION, type SchemaVaultsAppEnvironment } from "@schemavaults/app-definitions";
import type { UserData } from "@schemavaults/auth-common";
import {
  type AppToApiPermission,
  appToApiPermissionSchema,
} from "@schemavaults/app-definitions";
import { type NextRequest, NextResponse } from "next/server";
import {
  type IRouteGuard,
  RouteGuardFactory,
} from "@schemavaults/auth-server-sdk";

/**
 * Connect a frontend app client to an API server
 *
 * @param req The incoming request
 * @returns The response
 */
export async function POST(
  req: NextRequest,
  props: { params: Promise<{ client_app_id: string; api_server_id: string }> },
): Promise<NextResponse> {
  const environment: SchemaVaultsAppEnvironment = getAppEnvironment();
  if (environment === "development") {
    console.log("[/api/apis/connect_app] GET request received");
  }

  // Load user data and make sure they're authorized to do things!
  let userData: UserData;
  try {
    const route_guard: IRouteGuard =
      await RouteGuardFactory.getInstance().createGuardFromAuthHeader(
        "admin",
        req.headers.get("Authorization") ??
          req.headers.get("authorization") ??
          null,
        SCHEMAVAULTS_AUTH_APP_DEFINITION.app_id,
      );
    const user: UserData | null = route_guard.user;
    if (!route_guard.isAccessAllowed() || !user) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Your access token does not grant you access to this resource",
        } satisfies ResourceCreationResponse,
        {
          status: 403,
        },
      );
    }
    userData = user;
  } catch (e: unknown) {
    console.error(e);
    return NextResponse.json(
      {
        success: false,
        message:
          "You must pass a valid access token in the Authorization header to use this resource",
      } satisfies ResourceCreationResponse,
      {
        status: 403,
      },
    );
  }

  if (!userData.admin) {
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

  const { api_server_id, client_app_id } = await props.params;

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

  await using dbh: ServerlessDatabase = ServerlessDatabase.createDBH();

  const appsToApiPermissionsRegistry: SchemaVaultsAppToApiPermissionsRegistry = new SchemaVaultsAppToApiPermissionsRegistry(
    dbh.db,
  )

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
}

export const dynamic = "force-dynamic"; // defaults to auto
