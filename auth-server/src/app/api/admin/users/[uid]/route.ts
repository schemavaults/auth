import "server-only";

import {
  type ResourceCreationResponse,
  UserRegistry,
  UserNotFoundError,
} from "@/lib/auth-db";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  type IProtectedAdminApiRouteProps,
  withAdminApiRouteGuard,
} from "@/lib/withAdminRouteGuard";
import type { ServerRuntime } from "next";
import captureServerException from "@/lib/captureServerException";

const ROUTE = "/api/admin/users/[uid]";

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";

const uidSchema = z.string().uuid();

async function DELETE_user_handler(
  { user, dbh }: IProtectedAdminApiRouteProps,
  target_uid: string,
): Promise<NextResponse> {
  if (!user.admin) {
    return NextResponse.json(
      {
        success: false,
        message: "You must be an admin to use this resource!",
      } satisfies ResourceCreationResponse,
      { status: 403 },
    );
  }

  if (user.uid === target_uid) {
    return NextResponse.json(
      {
        success: false,
        message: "You cannot delete your own account from the admin API.",
      } satisfies ResourceCreationResponse,
      { status: 400 },
    );
  }

  try {
    await new UserRegistry(dbh.db).deleteUser(target_uid);
  } catch (e: unknown) {
    if (e instanceof UserNotFoundError) {
      return NextResponse.json(
        {
          success: false,
          message: "User not found",
        } satisfies ResourceCreationResponse,
        { status: 404 },
      );
    }

    await captureServerException(dbh.db, e, {
      op_name: "DELETE_user_handler.deleteUser",
      route: ROUTE,
      uid: user.uid,
      context: { target_uid },
    });
    return NextResponse.json(
      {
        success: false,
        message: "Failed to delete user",
      } satisfies ResourceCreationResponse,
      { status: 500 },
    );
  }

  return NextResponse.json({
    success: true,
    message: "Successfully deleted user",
    resource_id: target_uid,
  } satisfies ResourceCreationResponse);
}

export async function DELETE(
  req: NextRequest,
  ctx: RouteContext<"/api/admin/users/[uid]">,
): Promise<NextResponse> {
  // The admin guard runs before uid parsing so unauthenticated and
  // non-admin callers can't probe parameter handling: 401/403 beat 400.
  const protected_route = await withAdminApiRouteGuard(
    async (opts: IProtectedAdminApiRouteProps): Promise<NextResponse> => {
      const { uid } = await ctx.params;
      const parsed = uidSchema.safeParse(uid);
      if (!parsed.success) {
        return NextResponse.json(
          {
            success: false,
            message: "Failed to parse target user ID",
          } satisfies ResourceCreationResponse,
          { status: 400 },
        );
      }
      return await DELETE_user_handler(opts, parsed.data);
    },
  );
  return await protected_route(req);
}
