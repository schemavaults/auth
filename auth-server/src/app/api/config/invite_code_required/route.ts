import "server-only";
import { NextRequest, NextResponse } from "next/server";
import inviteCodesRequired from "@/lib/config/invite-codes-required";
import ServerlessDatabase from "@/lib/auth-db/serverless-database";
import type { ServerRuntime } from "next/types";

export async function GET(req: NextRequest): Promise<NextResponse> {
  void req;

  await using dbh = ServerlessDatabase.createDBH();

  let inviteCodeRequired: boolean;
  try {
    inviteCodeRequired = await inviteCodesRequired(dbh.db);
  } catch (e: unknown) {
    console.error("Failed to load server setting on whether invite codes are required: ", e);
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

export const runtime: ServerRuntime = "edge";
export const dynamic = "force-dynamic";
