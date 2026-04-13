// /api/auth/verify-email/confirm

import "server-only";
import { type ServerRuntime } from "next";
import { type NextRequest, NextResponse } from "next/server";
import handleVerifyEmailConfirm from "./handle_verify_email_confirm";
import { getAppEnvironment, type SchemaVaultsAppEnvironment } from "@schemavaults/app-definitions";
import { withServerTrace } from "@/lib/withServerTrace";

export async function POST(
  req: NextRequest,
): Promise<NextResponse> {
  const environment: SchemaVaultsAppEnvironment = getAppEnvironment();

  let body_json: unknown;
  try {
    body_json = await req.json();
  } catch (e: unknown) {
    if (environment === "development") {
      console.error(e);
    }
    return NextResponse.json(
      { success: false, message: "Invalid body JSON" },
      { status: 400 },
    );
  }

  try {
    return await withServerTrace({
      op_name: "POST /api/auth/verify-email/confirm",
      op_category: "subroutine",
      event_id: crypto.randomUUID(),
      callback: async () => await handleVerifyEmailConfirm({ body: body_json, req }),
    });
  } catch (e: unknown) {
    console.error(
      "Internal server error attempting to handle /api/auth/verify-email/confirm",
      e,
    );
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 },
    );
  }
}

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
