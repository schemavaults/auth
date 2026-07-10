import "server-only";
import { type NextRequest, NextResponse } from "next/server";
import {
  type IProtectedAdminApiRouteProps,
  withAdminApiRouteGuard,
} from "@/lib/withAdminRouteGuard";
import { MfaRegistry, UserRegistry } from "@/lib/auth-db";
import type { ServerRuntime } from "next";
import { z } from "zod";
import captureServerException from "@/lib/captureServerException";
import { sendMfaSecurityAlertEmail } from "@/lib/mfa/send-mfa-security-alert-email";

const ROUTE = "/api/admin/users/[uid]/mfa";

const uidSchema = z.string().uuid();

async function DELETE_admin_reset_handler(
  { dbh, redis, environment }: IProtectedAdminApiRouteProps,
  target_uid: string,
): Promise<NextResponse> {
  try {
    const userRegistry = new UserRegistry(dbh.db);
    const target = await userRegistry.getUserByUID(target_uid);
    if (!target) {
      return NextResponse.json(
        { success: false, message: "User not found" },
        { status: 404 },
      );
    }

    const mfaRegistry = new MfaRegistry(dbh.db);
    await mfaRegistry.deleteAllFactorsForUser(target_uid);

    await sendMfaSecurityAlertEmail({
      to: target.email,
      action: "admin_reset",
      db: dbh.db,
      redis,
      environment
    });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (e: unknown) {
    await captureServerException(dbh.db, e, {
      op_name: "DELETE_admin_reset_handler",
      route: ROUTE,
      uid: target_uid,
    });
    return NextResponse.json(
      { success: false, message: "Failed to reset user MFA" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  req: NextRequest,
  ctx: RouteContext<"/api/admin/users/[uid]/mfa">,
): Promise<NextResponse> {
  const { uid } = await ctx.params;
  const parsed = uidSchema.safeParse(uid);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, message: "Invalid uid in URL" },
      { status: 400 },
    );
  }
  return await (
    await withAdminApiRouteGuard((props) =>
      DELETE_admin_reset_handler(props, parsed.data),
    )
  )(req);
}

async function GET_admin_list_factor_types_handler(
  { dbh }: IProtectedAdminApiRouteProps,
  target_uid: string,
): Promise<NextResponse> {
  try {
    const userRegistry = new UserRegistry(dbh.db);
    const target = await userRegistry.getUserByUID(target_uid);
    if (!target) {
      return NextResponse.json(
        { success: false, message: "User not found" },
        { status: 404 },
      );
    }

    const mfaRegistry = new MfaRegistry(dbh.db);
    const factor_types = await mfaRegistry.listVerifiedFactorTypesForUser(
      target_uid,
    );

    return NextResponse.json(
      { success: true, data: { factor_types } },
      { status: 200 },
    );
  } catch (e: unknown) {
    await captureServerException(dbh.db, e, {
      op_name: "GET_admin_list_factor_types_handler",
      route: ROUTE,
      uid: target_uid,
    });
    return NextResponse.json(
      { success: false, message: "Failed to list user MFA factor types" },
      { status: 500 },
    );
  }
}

export async function GET(
  req: NextRequest,
  ctx: RouteContext<"/api/admin/users/[uid]/mfa">,
): Promise<NextResponse> {
  const { uid } = await ctx.params;
  const parsed = uidSchema.safeParse(uid);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, message: "Invalid uid in URL" },
      { status: 400 },
    );
  }
  return await (
    await withAdminApiRouteGuard((props) =>
      GET_admin_list_factor_types_handler(props, parsed.data),
    )
  )(req);
}

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
