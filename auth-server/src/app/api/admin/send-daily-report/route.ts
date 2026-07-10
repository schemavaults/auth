import "server-only";
import type { ServerRuntime } from "next";
import { type NextRequest, NextResponse } from "next/server";
import { withAdminApiRouteGuard } from "@/lib/withAdminRouteGuard";
import ServerlessDatabase from "@/lib/auth-db/serverless-database";
import { isCronAuthorizationHeaderValid } from "@/lib/CronSecret";
import sendDailyReportHandler from "./sendDailyReportHandler";
import { RedisCache } from "@/lib/redis";

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";

async function handle(req: NextRequest): Promise<NextResponse> {
  if (isCronAuthorizationHeaderValid(req.headers.get("authorization"))) {
    await using dbh: ServerlessDatabase = ServerlessDatabase.createDBH();
    await using redis = RedisCache.createConnection();
    return await sendDailyReportHandler({ dbh, redis });
  }
  const protected_route = await withAdminApiRouteGuard(
    async ({ dbh, user, redis }) => await sendDailyReportHandler({ dbh, redis, uid: user.uid }),
  );
  return await protected_route(req);
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  return await handle(req);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  return await handle(req);
}
