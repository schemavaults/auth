import "server-only";

import {
  ServerlessDatabase,
  type ResourceCreationResponse,
  UserRegistry,
} from "@/lib/auth-db";
import { SCHEMAVAULTS_AUTH_APP_DEFINITION } from "@schemavaults/app-definitions";
import {
  inviteCodeDefinitionSchema,
  type InviteCodeDefinition,
  type UserData,
} from "@schemavaults/auth-common";
import type { IRouteGuard } from "@schemavaults/auth-server-sdk";
import { type NextRequest, NextResponse } from "next/server";
import RouteGuardFactory from "@/lib/RouteGuardFactory";

export async function POST(req: NextRequest): Promise<NextResponse> {
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

  let new_invite_code: InviteCodeDefinition;
  try {
    const body: unknown = await req.json();
    if (typeof body !== "object" || !body) {
      throw new Error("Request body was not JSON object!");
    }
    const parsed = await inviteCodeDefinitionSchema.safeParseAsync(body);
    if (!parsed.success) {
      throw parsed.error;
    }

    const tenSeconds: number = 10000;
    if (Math.abs(parsed.data.created_at - Date.now()) > tenSeconds) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Invite code definition 'created_at' too far in the past (over 10s)!",
        } satisfies ResourceCreationResponse,
        {
          status: 412,
        },
      );
    }

    new_invite_code = parsed.data satisfies InviteCodeDefinition;
  } catch (e: unknown) {
    console.error(
      "Failed to parse invite code definition from request body: ",
      e,
    );
    return NextResponse.json(
      {
        success: false,
        message: "Failed to parse invite code definition from request body!",
      } satisfies ResourceCreationResponse,
      {
        status: 400,
      },
    );
  }

  try {
    const registry = new UserRegistry(dbh.db);

    await registry.createInviteCode(new_invite_code);

    return NextResponse.json({
      success: true,
      message: "Successfully inserted invite code into database!",
      resource_id: new_invite_code.invite_code,
    } satisfies ResourceCreationResponse);
  } catch (e: unknown) {
    console.error("Failed to insert invite code into database: ", e);
    return NextResponse.json(
      {
        success: false,
        message: "Failed to insert invite code into database",
      } satisfies ResourceCreationResponse,
      {
        status: 500,
      },
    );
  }
}
