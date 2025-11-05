import "server-only";

import {
  SchemaVaultsApiServerRegistry,
  type ResourceCreationResponse,
  ServerlessDatabase,
} from "@/lib/auth-db";
import type { UserData } from "@schemavaults/auth";
import {
  type SchemaVaultsApiServerDefinition,
  schemaVaultsApiServerDefinitionSchema,
} from "@schemavaults/app-definitions";
import { SCHEMAVAULTS_AUTH_APP_DEFINITION } from "@schemavaults/app-definitions";

import { type NextRequest, NextResponse } from "next/server";
import {
  type IRouteGuard,
  RouteGuardFactory,
} from "@schemavaults/auth-server-sdk";

/**
 * Create a new API server
 *
 * @param req The incoming request
 * @returns The response
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  if (process.env.NODE_ENV === "development")
    console.log("[/api/apis/create] GET request received");

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
        message: "You must be an admin to create a new SchemaVaults API server",
      } satisfies ResourceCreationResponse,
      {
        status: 403,
      },
    );
  }

  let newResource: SchemaVaultsApiServerDefinition;
  try {
    const parsed = await schemaVaultsApiServerDefinitionSchema.safeParseAsync(
      await req.json(),
    );
    if (!parsed.success) throw parsed.error;
    newResource = parsed.data;
  } catch (e: unknown) {
    const errorMessage =
      "Failed to parse new SchemaVaults API server details from request body";
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

  let apiServerRegistry: SchemaVaultsApiServerRegistry;
  try {
    apiServerRegistry = new SchemaVaultsApiServerRegistry(dbh.db);
  } catch (e: unknown) {
    console.error(e);
    return NextResponse.json(
      {
        success: false,
        message: "Failed to connect to API servers registry",
      } satisfies ResourceCreationResponse,
      {
        status: 500,
      },
    );
  }

  try {
    await apiServerRegistry.registerApiServer(
      newResource.api_server_id,
      newResource.api_server_name,
      newResource.api_server_description,
      newResource.public,
    );

    return NextResponse.json({
      success: true,
      message: "Successfully created new SchemaVaults API server",
      resource_id: newResource.api_server_id,
    } satisfies ResourceCreationResponse);
  } catch (e: unknown) {
    console.error("Failed to create SchemaVaults API server: ", e);
    return NextResponse.json(
      {
        success: false,
        message: "Failed to create new SchemaVaults API server",
      } satisfies ResourceCreationResponse,
      {
        status: 500,
      },
    );
  }
}

export const dynamic = "force-dynamic"; // defaults to auto
