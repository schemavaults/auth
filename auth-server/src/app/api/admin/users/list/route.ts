import "server-only";
import { NextResponse } from "next/server";
import {
  type ResourceCreationResponse,
  UserRegistry,
  type UserDocument,
} from "@/lib/auth-db";
import { IProtectedAdminApiRouteProps, withAdminApiRouteGuard } from "@/lib/withAdminRouteGuard";

async function GET_list_users_handler({ user, dbh }: IProtectedAdminApiRouteProps): Promise<NextResponse> {
  if (!user.admin) {
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

export const GET = withAdminApiRouteGuard(GET_list_users_handler)
