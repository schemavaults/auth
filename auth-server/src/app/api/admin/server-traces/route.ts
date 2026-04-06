import "server-only";
import { type NextRequest, NextResponse } from "next/server";
import { type IProtectedAdminApiRouteProps, withAdminApiRouteGuard } from "@/lib/withAdminRouteGuard";
import type { ServerRuntime } from "next";
import type { ServerTraceRow } from "@/lib/auth-db/server-traces";
import type { ResourceCreationResponse } from "@/lib/auth-db";

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

  let traces: readonly ServerTraceRow[];
  try {
    traces = await dbh.db
      .selectFrom("server_traces")
      .selectAll()
      .orderBy("start_time", "desc")
      .limit(200)
      .execute();
  } catch (e: unknown) {
    console.error("Failed to list server traces: ", e);
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

export async function GET(req: NextRequest): Promise<NextResponse> {
  const protected_route = await withAdminApiRouteGuard(GET_list_server_traces_handler);
  return await protected_route(req);
}
