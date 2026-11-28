# @schemavaults/openapi-docs-ui

React components (built on [`@schemavaults/ui`](https://github.com/schemavaults/ui)) and
Next.js App Router page factories for browsing an OpenAPI 3.x document: an index of
every route grouped by tag, and one page per operation showing parameters, request /
response schemas, and the **authentication scheme + permissions** the caller needs.

Pairs with `@schemavaults/openapi-operations`, whose generated documents carry the
`x-schemavaults-auth` extension (route guard, required scopes, organization role) and
the document-level `x-schemavaults-scopes` list (what each scope allows) that this
package surfaces. Any other OpenAPI 3.x document works too; auth details then come
from the standard `security` requirements, and scope descriptions from `oauth2` flows.

## Install

```bash
bun add @schemavaults/openapi-docs-ui
# peer deps: react, react-dom, next, @schemavaults/ui, lucide-react
```

The `@schemavaults/ui` peer range is wide (`>=0.125.0 <1.0.0`), so apps upgrade it on
their own schedule. Monorepo upgrades bump only the pinned `devDependencies` entry (the
version this package is built and tested against); raise the peer range's lower bound
only when this package starts using something a newer `@schemavaults/ui` added.

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
  // Optional: the public origin, resolved per request (never during
  // generateStaticParams). Replaces the document's `servers` on the pages,
  // so the header and curl examples show the real deployment URL.
  resolveServerUrl: async () => {
    const h = await headers(); // from "next/headers"
    return `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
  },
  // Optional: a way back into the app from every docs page (see below).
  backLink: { href: "/dashboard", label: "Back to dashboard" },
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

### Navigation back into the app

Docs pages often live outside the app's own layout, so the factory can put a way
back at the top of the index and of every operation page (above the header /
breadcrumb):

- `backLink: { href, label? }` renders an "← label" link (`label` defaults to
  `"Back"`).
- `navigation` renders the app's own navigation UI after the back link: any React
  node (server or client components, e.g. a logo and the app's main links), or a
  function of the page being rendered (`{ page: "index", model }` or
  `{ page: "operation", model, operation }`) for navigation that differs per page.

```tsx
createApiDocsPages({
  // ...
  backLink: { href: "/projects", label: "Back to projects" },
  navigation: (
    <nav aria-label="App" className="flex gap-4">
      <Link href="/projects">Projects</Link>
      <Link href="/settings">Settings</Link>
    </nav>
  ),
});
```

Both are also props of `ApiDocsIndex` and `ApiOperationPage` (where `indexProps` /
`operationProps` set them, those win over the shared options). For chrome around the
whole page (a site header and footer), use `wrap` instead.

Slugs are derived from method + path (`GET /api/apps/{app_id}` → `get-api-apps-app_id`)
and stay stable across regenerations. Unknown slugs call `notFound()`.

## Components

Everything is a plain function of serialisable props, so the components work in
server or client components.

| Export | Renders |
| --- | --- |
| `ApiDocsIndex` | back link / navigation + header + auth schemes + scopes + one card per tag with a method/path/summary/access table (`hideAuthentication`, `hideScopes`, `backLink`, `navigation`) |
| `ApiOperationPage` | back link / navigation (`backLink`, `navigation`), breadcrumb, summary, `OperationAuthCard`, parameter tables, request body, responses, curl example |
| `OperationAuthCard` / `OperationAuthBadges` | accepted credentials, who may call (authenticated / admin), required scopes (with their descriptions when given `scopes`), organization role, notes |
| `ApiSecuritySchemesCard` | every `components.securitySchemes` entry with how the credential is transported |
| `ApiScopesCard` | every scope of the API (`model.scopes`): what it allows and the operations requiring it; `scopeAnchorId(scope)` is each entry's anchor |
| `SchemaViewer` | nested property table for a JSON schema (`$ref`s resolved against `components.schemas`) |
| `ApiDocsNavigation` / `ApiDocsBackLink` | the row at the top of the pages leading back into the app: an "← Back" link and / or custom navigation (renders nothing without either) |
| `ParametersTable`, `RequestBodySection`, `ResponsesList`, `CurlSnippet`, `ApiDocsHeader` | building blocks used by the pages |
| `DocsText` | a description string with its CommonMark code spans (`` `name` ``) as inline `<code>`; every description on the pages goes through it |

## Model layer (`@schemavaults/openapi-docs-ui/model`)

`parseOpenApiDocument(doc)` turns a document into an `ApiDocsModel` (operations with
slugs, parameters, bodies, responses, auth, tags, security schemes, scopes, component
schemas). `model.scopes` lists the `x-schemavaults-scopes` entries, then the scopes of
`oauth2` flows, then any other scope an operation requires, each with its description
(when known) and the slugs of the operations requiring it (`requiredBy`).
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
