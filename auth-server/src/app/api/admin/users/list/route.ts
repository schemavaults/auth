import "server-only";
import { type NextRequest, NextResponse } from "next/server";
import {
  type ResourceCreationResponse,
  ServerlessDatabase,
  UserRegistry,
  type UserDocument,
} from "@/lib/auth-db";
import type { UserData } from "@schemavaults/auth-common";
import type { IRouteGuard } from "@schemavaults/auth-server-sdk";
import { SCHEMAVAULTS_AUTH_APP_DEFINITION } from "@schemavaults/app-definitions";
import RouteGuardFactory from "@/lib/RouteGuardFactory";

export async function GET(req: NextRequest): Promise<NextResponse> {
  await using dbh: ServerlessDatabase = ServerlessDatabase.createDBH();

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

  let users: readonly UserDocument[];
  try {
    const registry = new UserRegistry(dbh.db);
    users = await registry.listAllUsers();
  } catch (e: unknown) {
    console.error("Failed to list all users: ", e);
    return NextResponse.json(
      {
        success: false,
        message: "Failed to list all users!",
      } satisfies ResourceCreationResponse,
      {
        status: 500,
      },
    );
  }

  return NextResponse.json(
    {
      success: true,
      message: "Successfully listed all users!",
      data: {
        users,
      },
    },
    {
      status: 200,
    },
  );
}
