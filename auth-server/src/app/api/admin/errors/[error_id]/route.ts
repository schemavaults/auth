import "server-only";

import { type ResourceCreationResponse } from "@/lib/auth-db";
import { deleteErrorById } from "@/lib/auth-db/errors";
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

async function DELETE_error_by_id_handler(
  { user, dbh }: IProtectedAdminApiRouteProps,
  error_id: string,
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

  try {
    const deleted = await deleteErrorById(dbh.db, error_id);
    if (!deleted) {
      return NextResponse.json(
        {
          success: false,
          message: "Error not found",
        } satisfies ResourceCreationResponse,
        { status: 404 },
      );
    }
  } catch (e: unknown) {
    await captureServerException(dbh.db, e, {
      op_name: "DELETE_error_by_id_handler.deleteErrorById",
      route: "/api/admin/errors/[error_id]",
      uid: user.uid,
      context: { error_id },
    });
    return NextResponse.json(
      {
        success: false,
        message: "Failed to delete error",
      } satisfies ResourceCreationResponse,
      { status: 500 },
    );
  }

  return NextResponse.json({
    success: true,
    message: "Successfully deleted error",
    resource_id: error_id,
  } satisfies ResourceCreationResponse);
}

async function parseErrorId(
  props: { params: Promise<{ error_id: string }> },
): Promise<
  { ok: true; error_id: string } | { ok: false; response: NextResponse }
> {
  const params = await props.params;
  try {
    if (
      typeof params !== "object" ||
      !params ||
      !("error_id" in params) ||
      typeof params.error_id !== "string"
    ) {
      throw new Error(
        "Failed to load error_id from dynamic [error_id] route segment!",
      );
    }
    const parsed = await z.string().uuid().safeParseAsync(params.error_id);
    if (!parsed.success || parsed.data !== params.error_id) {
      throw new Error("Invalid UUID supplied for target error!");
    }
    return { ok: true, error_id: parsed.data };
  } catch (e: unknown) {
    console.error("Failed to parse target error ID: ", e);
    return {
      ok: false,
      response: NextResponse.json(
        {
          success: false,
          message: "Failed to parse target error ID",
        } satisfies ResourceCreationResponse,
        { status: 400 },
      ),
    };
  }
}

export async function DELETE(
  req: NextRequest,
  props: { params: Promise<{ error_id: string }> },
): Promise<NextResponse> {
  const parsed = await parseErrorId(props);
  if (!parsed.ok) return parsed.response;
  const error_id = parsed.error_id;

  const protected_route = await withAdminApiRouteGuard(
    async (opts: IProtectedAdminApiRouteProps): Promise<NextResponse> =>
      await DELETE_error_by_id_handler(opts, error_id),
  );
  return await protected_route(req);
}
