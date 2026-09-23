import "server-only";
import type { ServerRuntime } from "next";
import { toNextRouteHandlers, createOperationsApp } from "@schemavaults/openapi-operations";
import { getAuthServerUri } from "@/lib/auth_server_uri";
import { getOpenApiDocument, OPENAPI_DOCUMENT_PATH, withServerUrl } from "@/lib/api/openapi-document";

// GET /api/openapi.json — the one document describing every operation
// served by the sibling route files. It is generated from the catalogue in
// src/lib/api/operations/, which src/lib/api/routes.test.ts keeps in sync
// with the route files.
export const { GET } = toNextRouteHandlers(
  createOperationsApp({
    operations: [],
    openapi: {
      path: OPENAPI_DOCUMENT_PATH,
      // Report the deployment's public URL in `servers` instead of the
      // static document's relative "/".
      document: () => withServerUrl(getOpenApiDocument(), getAuthServerUri()),
    },
  }),
  ["get"],
);

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
