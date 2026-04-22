import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import {
  type IProtectedAuthenticatedApiRouteProps,
  withAuthenticatedApiRouteGuard,
} from "@/lib/withAuthenticatedRouteGuard";
import { listUserPendingInvitations } from "@/lib/auth-db/organizations";
import type { ServerRuntime } from "next";
import captureServerException from "@/lib/captureServerException";

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";

async function GET_user_invitations_handler(
  { user, dbh }: IProtectedAuthenticatedApiRouteProps
): Promise<NextResponse> {
  try {
    const invitations = await listUserPendingInvitations(dbh.db, user.uid);

    return NextResponse.json(
      {
        success: true,
        message: "Successfully listed pending invitations",
        data: {
          invitations,
        },
      },
      { status: 200 }
    );
  } catch (e: unknown) {
    await captureServerException(dbh.db, e, {
      op_name: "GET_user_invitations_handler.listUserPendingInvitations",
      route: "/api/me/invitations",
      uid: user.uid,
    });
    return NextResponse.json(
      {
        success: false,
        message: "Failed to list pending invitations",
      },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  return await (await withAuthenticatedApiRouteGuard(GET_user_invitations_handler))(req);
}
