import "server-only";

import { type NextRequest, NextResponse } from "next/server";
import { handleCorsPreflightForSchemaVaultsRegistry } from "@/lib/cors/cors-for-schemavaults-registry";

const CORS_METHODS = "GET, DELETE, OPTIONS" as const;

export function OPTIONS(req: NextRequest): NextResponse {
  return handleCorsPreflightForSchemaVaultsRegistry(req, CORS_METHODS);
}
