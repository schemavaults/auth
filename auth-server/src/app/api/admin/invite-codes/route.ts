import "server-only";
import { withAdminApiRouteGuard } from '@/lib/withAdminRouteGuard'
import POST_create_handler from './POST_create_handler'
import type { ServerRuntime } from "next";
import { type NextRequest, NextResponse } from "next/server";
import GET_list_invite_codes from "./GET_list_invite_codes";

export const runtime: ServerRuntime = "edge"
export const dynamic = "force-dynamic"; // defaults to auto

export async function POST(req: NextRequest): Promise<NextResponse> {
  return await (await withAdminApiRouteGuard(POST_create_handler))(req)
}

export async function GET(req: NextRequest): Promise <NextResponse> {
  const protected_route = await withAdminApiRouteGuard(GET_list_invite_codes);
  return await protected_route(req);
}
