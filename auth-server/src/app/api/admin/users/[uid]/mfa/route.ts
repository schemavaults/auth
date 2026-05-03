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

function extractTargetUidOrError(
  req: NextRequest,
): { ok: true; uid: string } | { ok: false; response: NextResponse } {
  const url = new URL(req.url);
  // Path is /api/admin/users/<uid>/mfa
  const segments = url.pathname.split("/").filter(Boolean);
  // segments[-2] is the uid (last is "mfa")
  const target_uid = segments[segments.length - 2];
  if (!target_uid) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, message: "Missing uid in URL" },
        { status: 400 },
      ),
    };
  }
  const parsed = z.string().uuid().safeParse(target_uid);
  if (!parsed.success) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, message: "Invalid uid in URL" },
        { status: 400 },
      ),
    };
  }
  return { ok: true, uid: parsed.data };
}

async function DELETE_admin_reset_handler(
  { dbh, req }: IProtectedAdminApiRouteProps,
): Promise<NextResponse> {
  const parsed = extractTargetUidOrError(req);
  if (!parsed.ok) return parsed.response;
  const target_uid = parsed.uid;

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

    void sendMfaSecurityAlertEmail({
      to: target.email,
      action: "admin_reset",
      db: dbh.db,
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

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  return await (await withAdminApiRouteGuard(DELETE_admin_reset_handler))(req);
}

async function GET_admin_list_factor_types_handler(
  { dbh, req }: IProtectedAdminApiRouteProps,
): Promise<NextResponse> {
  const parsed = extractTargetUidOrError(req);
  if (!parsed.ok) return parsed.response;
  const target_uid = parsed.uid;

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

export async function GET(req: NextRequest): Promise<NextResponse> {
  return await (await withAdminApiRouteGuard(GET_admin_list_factor_types_handler))(req);
}

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
