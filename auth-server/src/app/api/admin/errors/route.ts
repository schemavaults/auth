import "server-only";

import { type ResourceCreationResponse } from "@/lib/auth-db";
import { deleteErrorsBefore } from "@/lib/auth-db/errors";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  type IProtectedAdminApiRouteProps,
  withAdminApiRouteGuard,
} from "@/lib/withAdminRouteGuard";
import type { ServerRuntime } from "next";
import captureServerException from "@/lib/captureServerException";

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";

const beforeParamSchema = z.union([
  z.coerce.number().int().nonnegative(),
  z.string().datetime(),
]);

function parseBeforeParam(
  raw: string | null,
): { ok: true; before_ms: number } | { ok: false; message: string } {
  if (raw === null || raw.length === 0) {
    return {
      ok: false,
      message:
        "Missing required 'before' search parameter (ISO-8601 datetime or ms epoch).",
    };
  }

  const parsed = beforeParamSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      message:
        "Invalid 'before' search parameter; expected an ISO-8601 datetime or a non-negative integer ms epoch.",
    };
  }

  // ms epoch of 0 (1970-01-01Z) is a semantically valid cutoff — it just
  // deletes nothing — so we accept any finite non-negative value here.
  const before_ms =
    typeof parsed.data === "number"
      ? parsed.data
      : new Date(parsed.data).getTime();

  if (!Number.isFinite(before_ms) || before_ms < 0) {
    return {
      ok: false,
      message: "Invalid 'before' search parameter; could not derive a timestamp.",
    };
  }

  return { ok: true, before_ms };
}

async function DELETE_errors_before_handler(
  { user, dbh }: IProtectedAdminApiRouteProps,
  req: NextRequest,
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

  // Parse query params AFTER the admin guard has accepted the caller so that
  // unauthenticated/non-admin probes can never reach 400 and distinguish
  // "missing/invalid param" from "not allowed". 401/403 must always win.
  const parsed = parseBeforeParam(req.nextUrl.searchParams.get("before"));
  if (!parsed.ok) {
    return NextResponse.json(
      {
        success: false,
        message: parsed.message,
      } satisfies ResourceCreationResponse,
      { status: 400 },
    );
  }
  const before_ms = parsed.before_ms;

  try {
    const deleted_count = await deleteErrorsBefore(dbh.db, before_ms);
    return NextResponse.json({
      success: true,
      message: `Deleted ${deleted_count} error${deleted_count === 1 ? "" : "s"} captured before ${new Date(before_ms).toISOString()}.`,
      resource_id: String(deleted_count),
    } satisfies ResourceCreationResponse);
  } catch (e: unknown) {
    await captureServerException(dbh.db, e, {
      op_name: "DELETE_errors_before_handler.deleteErrorsBefore",
      route: "/api/admin/errors",
      uid: user.uid,
      context: { before_ms },
    });
    return NextResponse.json(
      {
        success: false,
        message: "Failed to delete errors",
      } satisfies ResourceCreationResponse,
      { status: 500 },
    );
  }
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const protected_route = await withAdminApiRouteGuard(
    async (opts: IProtectedAdminApiRouteProps): Promise<NextResponse> =>
      await DELETE_errors_before_handler(opts, req),
  );
  return await protected_route(req);
}
