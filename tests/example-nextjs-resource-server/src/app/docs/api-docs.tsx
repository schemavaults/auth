import type { ReactElement } from "react";
import Link from "next/link";
import { createApiDocsPages } from "@schemavaults/openapi-docs-ui/nextjs";
import { openApiDocument } from "@/lib/api/openapi-document";

/**
 * Shared factory for the /docs pages: the index (`page.tsx`) and one
 * statically generated page per operation (`[slug]/page.tsx`).
 */
export const apiDocs = createApiDocsPages({
  loadDocument: () => openApiDocument,
  basePath: "/docs",
  openApiDocumentHref: "/api/openapi.json",
  operationProps: {
    // The document's server URL is relative ("/"); give curl an absolute
    // base matching `bun run dev` of this app.
    curlBaseUrl: "http://localhost:3007",
  },
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
