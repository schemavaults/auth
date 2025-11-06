import "server-only";
import { type NextRequest, NextResponse } from "next/server";
import {
  type ResourceCreationResponse,
  ServerlessDatabase,
  UserRegistry,
} from "@/lib/auth-db";
import type { InviteCodeDefinition, UserData } from "@schemavaults/auth-common";
import {
  type IRouteGuard,
  RouteGuardFactory,
} from "@schemavaults/auth-server-sdk";
import { SCHEMAVAULTS_AUTH_APP_DEFINITION } from "@schemavaults/app-definitions";

export async function GET(req: NextRequest): Promise<NextResponse> {
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

  await using dbh: ServerlessDatabase = ServerlessDatabase.createDBH();

  let invite_codes: readonly InviteCodeDefinition[];
  try {
    const registry = new UserRegistry(dbh.db);
    invite_codes = await registry.listAllInviteCodes();
  } catch (e: unknown) {
    console.error("Failed to list all invite codes: ", e);
    return NextResponse.json(
      {
        success: false,
        message: "Failed to list all invite codes!",
      } satisfies ResourceCreationResponse,
      {
        status: 500,
      },
    );
  }

  return NextResponse.json(
    {
      success: true,
      message: "Successfully listed all invite codes!",
      data: {
        invite_codes,
      },
    },
    {
      status: 200,
    },
  );
}
