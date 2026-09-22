import type { ReactElement } from "react";
import Link from "next/link";
import { createApiDocsPages } from "@schemavaults/openapi-docs-ui/nextjs";
import { OPENAPI_DOCUMENT_PATH, openApiDocument } from "@/lib/api/openapi-document";
import { resolvePublicOriginFromRequest } from "@/lib/api/public-origin-next";

/**
 * Shared factory for the /docs pages: the index (`page.tsx`) and one
 * statically generated page per operation (`[slug]/page.tsx`).
 */
export const apiDocs = createApiDocsPages({
  loadDocument: () => openApiDocument,
  basePath: "/docs",
  openApiDocumentHref: OPENAPI_DOCUMENT_PATH,
  // The generated document's server URL is a relative "/"; the pages show
  // the deployment's real origin instead, resolved per request from the
  // SCHEMAVAULTS_EXAMPLE_RESOURCE_SERVER_URL override or the incoming
  // Host / X-Forwarded-* headers (see src/lib/api/public-origin.ts).
  resolveServerUrl: resolvePublicOriginFromRequest,
  wrap: (page: ReactElement): ReactElement => (
    <main className="flex w-full max-w-5xl flex-col gap-6 self-center p-4">
      <nav className="text-sm">
        <Link href="/" className="underline-offset-4 hover:underline">
          ← @schemavaults/example-nextjs-resource-server
        </Link>
      </nav>
      {page}
    </main>
  ),
});
