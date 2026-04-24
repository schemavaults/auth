import "server-only";
import { withAdminApiRouteGuard } from "@/lib/withAdminRouteGuard";
import type { ServerRuntime } from "next";
import { type NextRequest, NextResponse } from "next/server";
import GET_count_invite_code_usages from "./GET_count_invite_code_usages";

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ invite_code: string }> },
): Promise<NextResponse> {
  const { invite_code } = await params;
  const protected_route = await withAdminApiRouteGuard(async (props) => {
    return GET_count_invite_code_usages(props, invite_code);
  });
  return await protected_route(req);
}
