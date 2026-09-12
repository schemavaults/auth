# @schemavaults/openapi-docs-ui

React components (built on [`@schemavaults/ui`](https://github.com/schemavaults/ui)) and
Next.js App Router page factories for browsing an OpenAPI 3.x document: an index of
every route grouped by tag, and one page per operation showing parameters, request /
response schemas, and the **authentication scheme + permissions** the caller needs.

Pairs with `@schemavaults/openapi-operations`, whose generated documents carry the
`x-schemavaults-auth` extension (route guard, required scopes, organization role) that
this package surfaces. Any other OpenAPI 3.x document works too; auth details then come
from the standard `security` requirements.

## Install

```bash
bun add @schemavaults/openapi-docs-ui
# peer deps: react, react-dom, next, @schemavaults/ui, lucide-react
```

`@schemavaults/ui` is styled with Tailwind via `@schemavaults/theme`; make sure your
Tailwind config includes this package's `dist/` in `content` (as for
`@schemavaults/auth-ui`).

## `docs/` directory in a Next.js app

```
app/docs/api-docs.ts        ← one shared factory
app/docs/page.tsx           ← index (all routes)
app/docs/[slug]/page.tsx    ← one page per operation, statically generated
```

```ts
// app/docs/api-docs.ts
import { createApiDocsPages } from "@schemavaults/openapi-docs-ui/nextjs";
import { openApiDocument } from "@/lib/openapi"; // from buildOpenApiDocument(), or fetched

export const apiDocs = createApiDocsPages({
  loadDocument: () => openApiDocument,     // object or already parsed ApiDocsModel
  basePath: "/docs",
  openApiDocumentHref: "/api/openapi.json", // optional link in the header
  wrap: (page) => <main className="container py-8">{page}</main>, // optional
});
```

```ts
// app/docs/page.tsx
import { apiDocs } from "../api-docs";
export const generateMetadata = apiDocs.generateIndexMetadata;
export default apiDocs.IndexPage;
```

```ts
// app/docs/[slug]/page.tsx
import { apiDocs } from "../../api-docs";
export const generateStaticParams = apiDocs.generateStaticParams;
export const generateMetadata = apiDocs.generateOperationMetadata;
export default apiDocs.OperationPage;
```

Slugs are derived from method + path (`GET /api/apps/{app_id}` → `get-api-apps-app_id`)
and stay stable across regenerations. Unknown slugs call `notFound()`.

## Components

Everything is a plain function of serialisable props, so the components work in
server or client components.

| Export | Renders |
| --- | --- |
| `ApiDocsIndex` | header + auth schemes + one card per tag with a method/path/summary/access table |
| `ApiOperationPage` | breadcrumb, summary, `OperationAuthCard`, parameter tables, request body, responses, curl example |
| `OperationAuthCard` / `OperationAuthBadges` | accepted credentials, who may call (authenticated / admin), required scopes, organization role, notes |
| `ApiSecuritySchemesCard` | every `components.securitySchemes` entry with how the credential is transported |
| `SchemaViewer` | nested property table for a JSON schema (`$ref`s resolved against `components.schemas`) |
| `ParametersTable`, `RequestBodySection`, `ResponsesList`, `CurlSnippet`, `ApiDocsHeader` | building blocks used by the pages |

## Model layer (`@schemavaults/openapi-docs-ui/model`)

`parseOpenApiDocument(doc)` turns a document into an `ApiDocsModel` (operations with
slugs, parameters, bodies, responses, auth, tags, security schemes, component schemas).
It is framework-free and JSON-serialisable, so it can be built on the server and handed
to client components. Helpers: `findOperationBySlug`, `operationSlug`,
`operationDocsHref`, `schemaTypeLabel`, `schemaProperties`, `exampleFromSchema`,
`resolveSchema`.

## Scripts

```bash
bun run build      # tsc + tsc-alias → dist/
bun run test       # bun test (model + render smoke tests)
bun run lint
bun run typecheck
```
