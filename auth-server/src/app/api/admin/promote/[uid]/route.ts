import "server-only";

import {
  ServerlessDatabase,
  type ResourceCreationResponse,
  UserRegistry,
} from "@/lib/auth-db";
import { SCHEMAVAULTS_AUTH_APP_DEFINITION } from "@schemavaults/app-definitions";
import type { UserData } from "@schemavaults/auth-common";
import type { IRouteGuard } from "@schemavaults/auth-server-sdk";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import RouteGuardFactory from "@/lib/RouteGuardFactory";

export async function POST(
  req: NextRequest,
  props: { params: Promise<{ uid: string }> },
): Promise<NextResponse> {
  await using dbh: ServerlessDatabase = ServerlessDatabase.createDBH();

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

  const params = await props.params;

  let new_superuser_uid: string;
  try {
    if (
      typeof params !== "object" ||
      !params ||
      !("uid" in params) ||
      typeof params.uid !== "string"
    ) {
      throw new Error("Failed to load UID from dynamic [uid] route segment!");
    }
    const route_param_uid = params.uid;
    const parsed = await z.string().uuid().safeParseAsync(route_param_uid);
    if (!parsed.success) {
      throw new Error(
        "Invalid UUID supplied for user 'uid' to promote to admin!",
      );
    } else if (parsed.data != params.uid) {
      console.error(
        "Failed to parse 'uid' to promote from route params! Value parsed from schema is not equivalent to route param input!",
      );
      throw new Error(
        "Failed to parse 'uid' to promote from route params! Value parsed from schema is not equivalent to route params input!",
      );
    }

    new_superuser_uid = parsed.data;
  } catch (e: unknown) {
    console.error("Failed to parse user ID to set as superuser: ", e);
    return NextResponse.json(
      {
        success: false,
        message: "Failed to parse user ID to set as superuser",
      } satisfies ResourceCreationResponse,
      {
        status: 400,
      },
    );
  }

  console.assert(
    typeof new_superuser_uid === "string",
    "Expected 'new_superuser_uid' to be a string if this point was reached!",
  );

  // Promote user with user ID 'new_superuser_uid' to superuser/admin
  try {
    await new UserRegistry(dbh.db).promoteToAdmin(new_superuser_uid);
  } catch (e: unknown) {
    console.error("Failed to set user as superuser: ", e);

    if (e instanceof Error) {
      if (
        e.message.includes("not found") ||
        e.message.includes("does not exist")
      ) {
        return NextResponse.json(
          {
            success: false,
            message: "User not found",
          } satisfies ResourceCreationResponse,
          {
            status: 404,
          },
        );
      }
    }

    return NextResponse.json(
      {
        success: false,
        message: "Failed to set user as superuser",
      } satisfies ResourceCreationResponse,
      {
        status: 500,
      },
    );
  }

  return NextResponse.json({
    success: true,
    message: "Successfully promoted user to admin",
    resource_id: new_superuser_uid,
  } satisfies ResourceCreationResponse);
}
