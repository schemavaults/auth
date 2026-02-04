import "server-only";

import {
  ServerlessDatabase,
  type ResourceCreationResponse,
  UserRegistry,
} from "@/lib/auth-db";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { type IProtectedAdminApiRouteProps, withAdminApiRouteGuard } from "@/lib/withAdminRouteGuard";
import type { ServerRuntime } from "next";

export const runtime: ServerRuntime = "edge"
export const dynamic = "force-dynamic"; // defaults to auto

async function POST_admin_promotion_handler(
  { user }: IProtectedAdminApiRouteProps,
  new_superuser_uid: string
): Promise<NextResponse> {
  await using dbh: ServerlessDatabase = ServerlessDatabase.createDBH();

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

export async function POST(
  req: NextRequest,
  props: { params: Promise<{ uid: string }> },
) {
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
  const protected_route: (req: NextRequest) => Promise<NextResponse> = await withAdminApiRouteGuard(
    async (opts: IProtectedAdminApiRouteProps): Promise<NextResponse> => {
      return await POST_admin_promotion_handler(opts, new_superuser_uid) satisfies NextResponse;
    }
  )
  return await protected_route(req);
}
