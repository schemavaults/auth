import "server-only";
import type { ServerRuntime } from "next";
import { NextResponse } from "next/server";
import { buildOidcDiscoveryDocument } from "@/lib/oidc/discovery-document";

/**
 * OIDC Discovery 1.0 §4 provider-configuration endpoint. Publicly
 * reachable at /.well-known/openid-configuration and, for plain OAuth
 * 2.0 clients, at the RFC 8414 path /.well-known/oauth-authorization-server
 * via the rewrites in next.config.ts (OpenID Provider Metadata is a
 * superset of RFC 8414 metadata, so one document serves both).
 * Unauthenticated by design.
 */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json(buildOidcDiscoveryDocument(), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=3600",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
