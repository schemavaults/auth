import "server-only";
import type { ServerRuntime } from "next";
import { NextResponse } from "next/server";
import { buildOidcDiscoveryDocument } from "@/lib/oidc/discovery-document";
import { ServerlessDatabase } from "@/lib/auth-db";
import { isDynamicClientRegistrationEnabled } from "@/lib/oidc/dynamic-client-registration";

/**
 * OIDC Discovery 1.0 §4 provider-configuration endpoint. Publicly
 * reachable at /.well-known/openid-configuration and, for plain OAuth
 * 2.0 clients, at the RFC 8414 path /.well-known/oauth-authorization-server
 * via the rewrites in next.config.ts (OpenID Provider Metadata is a
 * superset of RFC 8414 metadata, so one document serves both).
 * Unauthenticated by design.
 *
 * `registration_endpoint` (RFC 7591) is advertised only while dynamic
 * client registration is enabled by the `allow_dynamic_client_registration`
 * server setting, so MCP clients and other OAuth clients only attempt
 * registrations the server will accept. A failure to read the setting
 * degrades to not advertising it rather than failing discovery.
 */
export async function GET(): Promise<NextResponse> {
  let registration_endpoint: boolean = false;
  try {
    await using dbh = ServerlessDatabase.createDBH();
    registration_endpoint = await isDynamicClientRegistrationEnabled(dbh.db);
  } catch (e: unknown) {
    console.error(
      "[/api/oidc/openid-configuration] Failed to read the dynamic client registration setting; not advertising registration_endpoint:",
      e,
    );
  }
  return NextResponse.json(buildOidcDiscoveryDocument(undefined, { registration_endpoint }), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=3600",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
