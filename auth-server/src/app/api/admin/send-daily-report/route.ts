import "server-only";
import type { ServerRuntime } from "next";
import { type NextRequest, NextResponse } from "next/server";
import { withAdminApiRouteGuard } from "@/lib/withAdminRouteGuard";
import ServerlessDatabase from "@/lib/auth-db/serverless-database";
import { isCronAuthorizationHeaderValid } from "@/lib/CronSecret";
import sendDailyReportHandler from "./sendDailyReportHandler";

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";

async function handle(req: NextRequest): Promise<NextResponse> {
  if (isCronAuthorizationHeaderValid(req.headers.get("authorization"))) {
    await using dbh: ServerlessDatabase = ServerlessDatabase.createDBH();
    return await sendDailyReportHandler({ dbh });
  }
  const protected_route = await withAdminApiRouteGuard(
    async ({ dbh, user }) => sendDailyReportHandler({ dbh, uid: user.uid }),
  );
  return await protected_route(req);
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  return await handle(req);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  return await handle(req);
}
