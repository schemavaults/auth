import "server-only";
import { NextRequest, NextResponse } from "next/server";
import inviteCodesRequired from "@/lib/config/invite-codes-required";
import ServerlessDatabase from "@/lib/auth-db/serverless-database";
import { RedisCache } from "@/lib/redis";
import type { ServerRuntime } from "next/types";
import captureServerException from "@/lib/captureServerException";

export async function GET(req: NextRequest): Promise<NextResponse> {
  void req;

  await using dbh = ServerlessDatabase.createDBH();
  await using redis = RedisCache.createConnection();

  let inviteCodeRequired: boolean;
  try {
    inviteCodeRequired = await inviteCodesRequired(dbh.db, redis.client);
  } catch (e: unknown) {
    await captureServerException(dbh.db, e, {
      op_name: "GET_invite_code_required.inviteCodesRequired",
      route: "/api/config/invite_code_required",
    });
    return NextResponse.json({
      error: true,
      success: false,
      message: "Failed to load server setting!"
    }, { status: 500 })
  }

  return NextResponse.json({
    error: false,
    success: true,
    message: "Successfully loaded server config setting!",
    data: inviteCodeRequired
  }, { status: 200 })
}

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
