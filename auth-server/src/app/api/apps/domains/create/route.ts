import "server-only";

import {
  SchemaVaultsAppRegistry,
  ServerlessDatabase,
  type ResourceCreationResponse,
} from "@/lib/auth-db";
import type { UserData } from "@schemavaults/auth-common";
import {
  type SchemaVaultsAppDomainRef,
  schemaVaultsAppDomainRefSchema,
} from "@schemavaults/app-definitions";
import { type NextRequest, NextResponse } from "next/server";
import { SCHEMAVAULTS_AUTH_APP_DEFINITION } from "@schemavaults/app-definitions";
import {
  type IRouteGuard,
  RouteGuardFactory,
} from "@schemavaults/auth-server-sdk";

/**
 * Create a new domain for an application
 *
 * @param req The incoming request
 * @returns The response
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  if (process.env.NODE_ENV === "development") {
    console.log("[/api/apps/domains/create] POST request received");
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
        message: "You must be an admin to add a domain to an application",
      } satisfies ResourceCreationResponse,
      {
        status: 403,
      },
    );
  }

  let newResource: SchemaVaultsAppDomainRef;
  try {
    const parsed = await schemaVaultsAppDomainRefSchema.safeParseAsync(
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
        message: "Failed to connect to app registry",
      },
      {
        status: 500,
      },
    );
  }

  try {
    await appRegistry.addAppDomain(newResource.app_id, newResource);

    return NextResponse.json({
      success: true,
      message: "Successfully added domain to app",
      resource_id: newResource.app_id,
    } satisfies ResourceCreationResponse);
  } catch (e: unknown) {
    console.error("Failed to add domain to app: ", e);
    return NextResponse.json(
      {
        success: false,
        message: "Failed to add domain to app",
      } satisfies ResourceCreationResponse,
      {
        status: 500,
      },
    );
  }
}

export const dynamic = "force-dynamic"; // defaults to auto
