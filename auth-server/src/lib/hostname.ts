import { getAppEnvironment, type SchemaVaultsAppEnvironment } from "@schemavaults/app-definitions";
import type { NextRequest } from "next/server";

export default function getHostname(req: NextRequest | Request): string {
  const environment: SchemaVaultsAppEnvironment = getAppEnvironment();
  const hostHeader: string | null = req.headers.get("host") ?? req.headers.get("Host");

  if (environment === 'development' && hostHeader?.startsWith("localhost:")) {
    return "localhost";
  }

  if (!hostHeader) {
    throw new Error("Expected 'Host' header to be defined on request")
  }

  return hostHeader;
}
