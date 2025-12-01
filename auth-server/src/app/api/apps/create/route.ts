import "server-only";

import {
  SchemaVaultsAppRegistry,
  ServerlessDatabase,
  type ResourceCreationResponse,
} from "@/lib/auth-db";
import type { UserData } from "@schemavaults/auth-common";
import {
    getAppEnvironment,
  type SchemaVaultsApp,
  schemaVaultsAppDefinitionSchema,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import { SCHEMAVAULTS_AUTH_APP_DEFINITION } from "@schemavaults/app-definitions";
import { type NextRequest, NextResponse } from "next/server";
import {
  type IRouteGuard,
  RouteGuardFactory,
} from "@schemavaults/auth-server-sdk";

/**
 * Create a new frontend application
 *
 * @param req The incoming request
 * @returns The response
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const environment: SchemaVaultsAppEnvironment = getAppEnvironment();
  if (environment === "development")
    console.log("[/api/apps/create] POST request received");

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
    if (!route_guard.isAccessAllowed()) {
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
    if (!user) {
      return NextResponse.json(
        {
          success: false,
          message: "Failed to load user from authorization token",
        } satisfies ResourceCreationResponse,
        {
          status: 401,
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
        message:
          "You must be an admin to create a new SchemaVaults frontend application",
      } satisfies ResourceCreationResponse,
      {
        status: 403,
      },
    );
  }

  let newResource: SchemaVaultsApp;
  try {
    const parsed = await schemaVaultsAppDefinitionSchema.safeParseAsync(
      await req.json(),
    );
    if (!parsed.success) throw parsed.error;
    newResource = parsed.data;
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

  await using dbh: ServerlessDatabase = ServerlessDatabase.createDBH();

  let appRegistry: SchemaVaultsAppRegistry;
  try {
    appRegistry = new SchemaVaultsAppRegistry(dbh.db);
  } catch (e: unknown) {
    console.error(e);
    return NextResponse.json(
      {
        success: false,
        message: "Failed to connect to user registry",
      },
      {
        status: 500,
      },
    );
  }

  try {
    await appRegistry.registerApp(
      newResource.app_id,
      newResource.app_name,
      newResource.app_description,
      newResource.public,
    );

    return NextResponse.json({
      success: true,
      message: "Successfully created new SchemaVaults frontend app",
      resource_id: newResource.app_id,
    } satisfies ResourceCreationResponse);
  } catch (e: unknown) {
    console.error("Failed to create SchemaVaults frontend app: ", e);
    return NextResponse.json(
      {
        success: false,
        message: "Failed to create new SchemaVaults frontend app",
      } satisfies ResourceCreationResponse,
      {
        status: 500,
      },
    );
  }
}

export const dynamic = "force-dynamic"; // defaults to auto
