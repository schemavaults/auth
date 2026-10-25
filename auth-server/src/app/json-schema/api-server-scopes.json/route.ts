import "server-only";
import type { ServerRuntime } from "next";
import { getAuthServerUrl } from "@schemavaults/app-definitions";
import {
  buildApiServerScopesJsonSchema,
  type JsonSchemaDocument,
} from "@/lib/json-schema/api-server-scopes-json-schema";

// GET /json-schema/api-server-scopes.json — the JSON Schema of resource
// servers' scope manifests (the body of PUT
// /api/resource-server/apis/{api_server_id}/scopes), for the `$schema` of
// manifest files. A plain public route outside /api: it is not an API
// operation, so it has no catalogue entry and no credential.

let cached: { url: string; document: JsonSchemaDocument } | null = null;

export function GET(): Response {
  const url: string = getAuthServerUrl();
  if (cached?.url !== url) {
    cached = { url, document: buildApiServerScopesJsonSchema(url) };
  }
  return new Response(JSON.stringify(cached.document, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/schema+json",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
