import "server-only";
import { type NextRequest, NextResponse } from "next/server";
import {
  type ResourceCreationResponse,
  UserRegistry,
  type UserDocument,
} from "@/lib/auth-db";
import { type IProtectedAdminApiRouteProps, withAdminApiRouteGuard } from "@/lib/withAdminRouteGuard";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import type { ServerRuntime } from "next";
export const dynamic = "force-dynamic"; // defaults to auto
export const runtime: ServerRuntime = "edge";


async function GET_list_users_handler({ user, dbh }: IProtectedAdminApiRouteProps<AuthDatabase>): Promise<NextResponse> {
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

export async function GET(req: NextRequest): Promise<NextResponse> {
  const protected_route = await withAdminApiRouteGuard(GET_list_users_handler)
  return await protected_route(req);
}
