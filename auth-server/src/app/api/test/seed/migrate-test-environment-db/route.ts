import "server-only";
import type { ServerRuntime } from "next";

// we need nodejs for fs access on migrations/ directory
export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
import trigger from "./trigger_database_migration";
import { NextRequest, NextResponse } from "next/server";
import { getAppEnvironment } from "@schemavaults/app-definitions";

const notFoundBody = { error: true, success: false, message: "Route not available in this environment" } as const;

export async function GET(req: NextRequest) {
  if (getAppEnvironment() !== 'test') {
    return NextResponse.json(notFoundBody, { status: 404 })
  }
  return await trigger(req);
}

export async function POST(req: NextRequest) {
  if (getAppEnvironment() !== 'test') {
    return NextResponse.json(notFoundBody, { status: 404 })
  }
  return await trigger(req);
}
