import "server-only";
import { NextResponse } from "next/server";
import {
  type ResourceCreationResponse,
  UserRegistry,
} from "@/lib/auth-db";
import {
  type InviteCode,
  inviteCodeFormatSchema,
} from "@schemavaults/auth-common";
import { type IProtectedAdminApiRouteProps } from "@/lib/withAdminRouteGuard";
import type { ServerRuntime } from "next";
import captureServerException from "@/lib/captureServerException";

const ROUTE = "/api/admin/invite-codes/[invite_code]/usages";

export const runtime: ServerRuntime = "nodejs";

export async function GET_count_invite_code_usages(
  { user, dbh }: IProtectedAdminApiRouteProps,
  raw_invite_code: string,
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

  const parsed = await inviteCodeFormatSchema.safeParseAsync(raw_invite_code);
  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        message: "Invalid invite code format!",
      } satisfies ResourceCreationResponse,
      { status: 400 },
    );
  }
  const invite_code: InviteCode = parsed.data;

  let usage_count: number;
  try {
    const registry = new UserRegistry(dbh.db);
    usage_count = await registry.countInviteCodeUsages(invite_code);
  } catch (e: unknown) {
    await captureServerException(dbh.db, e, {
      op_name: "GET_count_invite_code_usages.countInviteCodeUsages",
      route: ROUTE,
      uid: user.uid,
      context: { invite_code },
    });
    return NextResponse.json(
      {
        success: false,
        message: "Failed to count invite code usages!",
      } satisfies ResourceCreationResponse,
      { status: 500 },
    );
  }

  if (typeof usage_count !== "number" || !Number.isFinite(usage_count)) {
    await captureServerException(
      dbh.db,
      new Error(
        `countInviteCodeUsages returned a non-numeric value for invite code '${invite_code}': ${String(usage_count)}`,
      ),
      {
        op_name: "GET_count_invite_code_usages.nonNumericResult",
        route: ROUTE,
        uid: user.uid,
        context: { invite_code, usage_count },
      },
    );
    return NextResponse.json(
      {
        success: false,
        message: "Failed to count invite code usages!",
      } satisfies ResourceCreationResponse,
      { status: 500 },
    );
  }

  return NextResponse.json(
    {
      success: true,
      message: "Successfully counted invite code usages!",
      data: {
        invite_code,
        usage_count,
      },
    },
    { status: 200 },
  );
}

export default GET_count_invite_code_usages;
