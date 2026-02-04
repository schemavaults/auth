import "server-only";
import { NextResponse } from "next/server";
import {
  type ResourceCreationResponse,
  ServerlessDatabase,
  UserRegistry,
} from "@/lib/auth-db";
import type { InviteCodeDefinition, UserData } from "@schemavaults/auth-common";
import { type IProtectedAdminApiRouteProps } from "@/lib/withAdminRouteGuard";
import type { ServerRuntime } from "next";

export const runtime: ServerRuntime = "edge"

export async function GET_list_invite_codes({ user }: IProtectedAdminApiRouteProps): Promise<NextResponse> {
  await using dbh: ServerlessDatabase = ServerlessDatabase.createDBH();

  // Load user data and make sure they're authorized to do things!
  const userData: UserData = user;

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

export default GET_list_invite_codes;
