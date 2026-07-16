import "server-only";
import type { ServerRuntime } from "next";
import { NextResponse } from "next/server";
import { buildOidcDiscoveryDocument } from "@/lib/oidc/discovery-document";

/**
 * OIDC Discovery 1.0 §4 provider-configuration endpoint. Publicly
 * reachable at /.well-known/openid-configuration via the rewrite in
 * next.config.ts. Unauthenticated by design.
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
