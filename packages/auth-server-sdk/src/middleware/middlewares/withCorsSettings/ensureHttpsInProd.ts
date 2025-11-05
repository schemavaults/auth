import type { ISchemaVaultsMiddlewareFnInputs } from "@/middleware/middleware_types";
import {
  getAppEnvironment,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import type { AuthenticateResult } from "@schemavaults/auth";
import type { NextRequest, NextResponse } from "next/server";

function isHttpsOrigin(origin: string): origin is `https://${string}` {
  return origin.startsWith("https://");
}

export function ensureHttpsInProduction(
  request: NextRequest,
  origin: string,
  json: ISchemaVaultsMiddlewareFnInputs["json"],
): NextResponse | undefined {
  const environment: SchemaVaultsAppEnvironment = getAppEnvironment();

  if (
    // Ensure that origin uses https:// in production
    origin &&
    environment !== "development" &&
    environment !== "test" &&
    request.method !== "GET" &&
    !isHttpsOrigin(origin)
  ) {
    console.error("Origins must be HTTPS in production environment.");
    return json(
      {
        message: "Origin must be HTTPS",
        success: false,
      } satisfies AuthenticateResult,
      { status: 400 },
    );
  } // End of HTTPS origins in production check
  return undefined;
}
