import "server-only";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { type IProtectedAdminApiRouteProps, withAdminApiRouteGuard } from "@/lib/withAdminRouteGuard";
import type { ServerRuntime } from "next";
import type { ServerTraceRow } from "@/lib/auth-db/server-traces";
import type { ResourceCreationResponse } from "@/lib/auth-db";
import captureServerException from "@/lib/captureServerException";
import { type ServerTrace, serverTraceSchema } from "@/lib/server-trace-schema";

export const dynamic = "force-dynamic";
export const runtime: ServerRuntime = "nodejs";

async function GET_list_server_traces_handler({ user, dbh }: IProtectedAdminApiRouteProps): Promise<NextResponse> {
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

  let rawTraces: readonly ServerTraceRow[];
  try {
    rawTraces = await dbh.db
      .selectFrom("server_traces")
      .selectAll()
      .orderBy("start_time", "desc")
      .limit(200)
      .execute();
  } catch (e: unknown) {
    await captureServerException(dbh.db, e, {
      op_name: "GET_list_server_traces_handler.listServerTraces",
      route: "/api/admin/server-traces",
      uid: user.uid,
    });
    return NextResponse.json(
      {
        success: false,
        message: "Failed to list server traces!",
      } satisfies ResourceCreationResponse,
      {
        status: 500,
      },
    );
  }

  // Postgres BIGINT columns come back from the driver as strings to preserve
  // 64-bit precision. start_time/end_time are ms epoch timestamps that fit
  // safely in Number, so coerce them here before returning JSON.
  const normalized = rawTraces.map((row) => ({
    ...row,
    start_time: toNumber(row.start_time),
    end_time: toNumber(row.end_time),
  }));

  const parsed = z.array(serverTraceSchema).safeParse(normalized);
  if (!parsed.success) {
    await captureServerException(dbh.db, parsed.error, {
      op_name: "GET_list_server_traces_handler.parseServerTraces",
      route: "/api/admin/server-traces",
      uid: user.uid,
    });
    return NextResponse.json(
      {
        success: false,
        message: "Failed to list server traces!",
      } satisfies ResourceCreationResponse,
      {
        status: 500,
      },
    );
  }
  const traces: readonly ServerTrace[] = parsed.data;

  return NextResponse.json(
    {
      success: true,
      message: "Successfully listed server traces!",
      data: {
        traces,
      },
    },
    {
      status: 200,
    },
  );
}

function toNumber(value: unknown): number {
  return typeof value === "string" ? parseInt(value, 10) : Number(value);
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const protected_route = await withAdminApiRouteGuard(GET_list_server_traces_handler);
  return await protected_route(req);
}
