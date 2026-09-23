import "server-only";
import type { ReactElement } from "react";
import { createApiDocsPages } from "@schemavaults/openapi-docs-ui/nextjs";
import { getAuthServerUri } from "@/lib/auth_server_uri";
import { API_DOCS_PATH, getOpenApiDocument, OPENAPI_DOCUMENT_PATH } from "@/lib/api/openapi-document";
import { DocsShell } from "./docs-shell";

/**
 * Shared factory for the /docs pages: the index (`page.tsx`) and one page per
 * operation (`[slug]/page.tsx`, enumerated by `generateStaticParams`). Both
 * render the OpenAPI document generated from the operation catalogue in
 * src/lib/api/operations/, the same document served at /api/openapi.json.
 */
export const apiDocs = createApiDocsPages({
  loadDocument: getOpenApiDocument,
  basePath: API_DOCS_PATH,
  openApiDocumentHref: OPENAPI_DOCUMENT_PATH,
  // The generated document's server URL is a relative "/"; the pages show
  // the deployment's public URL (SCHEMAVAULTS_AUTH_SERVER_URL / the
  // environment default) instead.
  resolveServerUrl: (): string | undefined => {
    try {
      return getAuthServerUri();
    } catch {
      return undefined;
    }
  },
  wrap: (page: ReactElement): ReactElement => <DocsShell>{page}</DocsShell>,
});
