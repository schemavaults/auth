import "server-only";

import {
  AuthorizedAppsRegistry,
  ServerlessDatabase,
  type ResourceCreationResponse,
} from "@/lib/auth-db";
import type { UserData } from "@schemavaults/auth-common";
import { getAppEnvironment, SCHEMAVAULTS_AUTH_APP_DEFINITION, type SchemaVaultsAppEnvironment } from "@schemavaults/app-definitions";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  type IRouteGuard,
  RouteGuardFactory,
} from "@schemavaults/auth-server-sdk";

const authorizeAppEndpointRequestBodySchema = z
  .object({
    app_id: z.string().uuid(),
  })
  .required()
  .strict();

/**
 * Authorize a frontend application to receive authentication tokens on your behalf
 *
 * @param req The incoming request
 * @returns The response
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const environment: SchemaVaultsAppEnvironment = getAppEnvironment();
  if (environment === "development")
    console.log("[/api/apps/authorize] GET request received");

  // Load user data and make sure they're authorized to do things!
  let userData: UserData;
  try {
    const route_guard: IRouteGuard =
      await RouteGuardFactory.getInstance().createGuardFromAuthHeader(
        "authenticated",
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

  let app_id: string;
  try {
    const parsed_body =
      await authorizeAppEndpointRequestBodySchema.safeParseAsync(
        await req.json(),
      );
    if (!parsed_body.success) throw parsed_body.error;
    app_id = parsed_body.data.app_id;
  } catch (e: unknown) {
    return NextResponse.json(
      {
        success: false,
        message: "Invalid 'app_id' to authorize app for",
      } satisfies ResourceCreationResponse,
      {
        status: 400,
      },
    );
  }

  await using dbh: ServerlessDatabase = ServerlessDatabase.createDBH();

  try {
    const registry = new AuthorizedAppsRegistry(dbh.db);
    await registry.authorizeAppForUser(
      userData.uid, // user id
      app_id, // frontend app id
    );

    return NextResponse.json({
      success: true,
      message:
        "Successfully authorized frontend application to receive tokens on your behalf",
      resource_id: app_id,
    } satisfies ResourceCreationResponse);
  } catch (e: unknown) {
    console.error("Failed to authorize SchemaVaults frontend application: ", e);
    return NextResponse.json(
      {
        success: false,
        message: "Failed to authorize SchemaVaults frontend application",
      } satisfies ResourceCreationResponse,
      {
        status: 500,
      },
    );
  }
}

export const dynamic = "force-dynamic"; // defaults to auto
