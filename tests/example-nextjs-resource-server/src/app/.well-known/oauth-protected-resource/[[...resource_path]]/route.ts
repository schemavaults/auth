import "server-only";
import type { ServerRuntime } from "next";
import { createOAuthProtectedResourceMetadataRoute } from "@schemavaults/auth-server-sdk/oauth-protected-resource";

// GET /.well-known/oauth-protected-resource[/<resource path>]
// OAuth 2.0 Protected Resource Metadata (RFC 9728): names the auth server
// that issues tokens for this resource server and the `resource` URL
// (SCHEMAVAULTS_RESOURCE_URL) clients request them for. The optional
// catch-all also answers the path-suffixed form RFC 9728 §3.1 derives
// from a resource URL with a path (`http://host/api` →
// `/.well-known/oauth-protected-resource/api`). Protocol metadata, not
// part of this server's API, so it is not an operation in
// src/lib/api/operations.ts.
export const { GET, OPTIONS } = createOAuthProtectedResourceMetadataRoute({
  resource_name: "Example Next.js Resource Server API",
  resource_documentation: "/docs",
});

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
