// /api/auth/login

import "server-only";
import { type ServerRuntime } from "next";
import { type NextRequest, NextResponse } from "next/server";
import type { AuthenticateResult } from "@schemavaults/auth-common";
import handleLogin from "./handle_login";
import { getAppEnvironment, type SchemaVaultsAppEnvironment } from "@schemavaults/app-definitions";

export async function POST(
  req: NextRequest,
): Promise<NextResponse> {
  const environment: SchemaVaultsAppEnvironment = getAppEnvironment();
  // Ensure body is valid JSON
  let body_json: unknown;
  try {
    body_json = await req.json();
  } catch (e: unknown) {
    if (environment === "development") {
      console.error(e);
    }
    return NextResponse.json(
      {
        success: false,
        message: "Invalid body JSON",
      } satisfies AuthenticateResult,
      {
        status: 400,
      },
    );
  }

  try {
    return await handleLogin({ body: body_json, req });
  } catch (e: unknown) {
    console.error(
      "Internal server error attempting to handle /api/auth/login request",
      e,
    );
    return NextResponse.json(
      {
        success: false,
        message: "Internal server error",
      } satisfies AuthenticateResult,
      {
        status: 500,
      },
    );
  }
}

export const runtime: ServerRuntime = "edge";
export const dynamic = "force-dynamic";
