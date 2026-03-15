import "server-only";

import { type NextRequest, NextResponse } from "next/server";
import { handleCorsPreflightForSchemaVaultsWeb } from "@/lib/cors/cors-for-schemavaults-web";

const CORS_METHODS = "GET, OPTIONS";

export function OPTIONS(req: NextRequest): NextResponse {
  return handleCorsPreflightForSchemaVaultsWeb(req, CORS_METHODS);
}
