import "server-only";
import { withAdminApiRouteGuard } from '@/lib/withAdminRouteGuard'
import POST_create_handler from './POST_create_handler'
import type { ServerRuntime } from "next";
import { type NextRequest, NextResponse } from "next/server";

export const runtime: ServerRuntime = "edge"
export const dynamic = "force-dynamic"; // defaults to auto

export async function POST(req: NextRequest): Promise<NextResponse> {
  return await (await withAdminApiRouteGuard(POST_create_handler))(req)
}
