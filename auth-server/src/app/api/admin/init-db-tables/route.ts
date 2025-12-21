import "server-only";

import {
  initializeAuthDbTables,
  ServerlessDatabase,
  type ResourceCreationResponse,
} from "@/lib/auth-db";
import { SCHEMAVAULTS_AUTH_APP_DEFINITION } from "@schemavaults/app-definitions";
import type { UserData } from "@schemavaults/auth-common";
import { type IRouteGuard } from "@schemavaults/auth-server-sdk";
import { NextRequest, NextResponse } from "next/server";
import RouteGuardFactory from "@/lib/RouteGuardFactory";

export async function POST(req: NextRequest): Promise<NextResponse> {
  await using dbh = ServerlessDatabase.createDBH();

  // Load user data and make sure they're authorized to do things!
  let userData: UserData;
  try {
    const route_guard: IRouteGuard = await new RouteGuardFactory(
      dbh.db,
    ).createGuardFromAuthHeader(
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
        status: 401,
      },
    );
  }

  if (!userData.admin) {
    return NextResponse.json(
      {
        success: false,
        message: "You must be an admin to use this resource!",
      } satisfies ResourceCreationResponse,
      {
        status: 403,
      },
    );
  }

  try {
    await initializeAuthDbTables(dbh.db);
  } catch (e: unknown) {
    console.error(
      "Error attempting to initialize @schemavaults/auth-server postgres database: ",
      e,
    );
    return NextResponse.json(
      {
        success: false,
        message:
          "Error attempting to initialize @schemavaults/auth-server postgres database!",
      } satisfies ResourceCreationResponse,
      {
        status: 500,
      },
    );
  }

  return NextResponse.json(
    {
      success: true,
      message: "Initialized @schemavaults/auth-server postgres database!",
    },
    {
      status: 200,
    },
  );
}
