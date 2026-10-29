import "server-only";
import type { MetadataRoute, ServerRuntime } from "next";
import { getAuthServerUrl } from "@schemavaults/app-definitions";
import { operationDocsHref, parseOpenApiDocument } from "@schemavaults/openapi-docs-ui/model";
import { API_DOCS_PATH, getOpenApiDocument } from "@/lib/api/openapi-document";
import { buildAuthServerSitemap, PUBLIC_PAGE_PATHS } from "@/lib/seo/crawler-policy";

// GET /sitemap.xml — the pages anyone can open signed out, then one API
// reference page per operation (the same model the /docs pages render), as
// absolute URLs on this deployment's SCHEMAVAULTS_AUTH_SERVER_URL.

let docsPagePaths: string[] | null = null;

export default function sitemap(): MetadataRoute.Sitemap {
  docsPagePaths ??= parseOpenApiDocument(getOpenApiDocument()).operations.map(
    (operation) => operationDocsHref(API_DOCS_PATH, operation),
  );
  return buildAuthServerSitemap({
    auth_server_url: getAuthServerUrl(),
    paths: [...PUBLIC_PAGE_PATHS, ...docsPagePaths],
  });
}

export const runtime: ServerRuntime = "nodejs";
// Resolve the white-label URL per request instead of freezing it at build time.
export const dynamic = "force-dynamic";
