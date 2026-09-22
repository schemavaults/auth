import "server-only";
import type { ServerRuntime } from "next";
import { toNextRouteHandlers } from "@schemavaults/openapi-operations";
import { api } from "@/lib/api/app";
import { OPENAPI_DOCUMENT_PATH, openApiDocument } from "@/lib/api/openapi-document";
import { resolvePublicOrigin, withServerUrl } from "@/lib/api/public-origin";

// GET /api/openapi.json — the one document describing every operation
// served by the sibling route files. It is generated from the catalogue in
// src/lib/api/operations.ts, the same list every `apiRouteHandlers()` mount
// is checked against.
export const { GET } = toNextRouteHandlers(
  api.openApiDocumentApp({
    path: OPENAPI_DOCUMENT_PATH,
    // Report the deployment's real origin in `servers` instead of the
    // static document's relative "/".
    document: (c) =>
      withServerUrl(openApiDocument, resolvePublicOrigin((name) => c.req.header(name), c.req.url)),
  }),
  ["get"],
);

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
