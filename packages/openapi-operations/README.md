# @schemavaults/openapi-operations

Define HTTP operations once — method, path, [zod](https://zod.dev) v4 request/response
schemas, and the auth scheme + permissions a caller needs — then:

- generate an **OpenAPI 3.1 document** from them
  (via [`@asteasolutions/zod-to-openapi`](https://github.com/asteasolutions/zod-to-openapi)), and
- serve them as a **[Hono](https://hono.dev) app** on Vercel functions or Next.js
  App Router route handlers, with request validation and auth enforcement built in.

The same definitions power the auth server and third-party resource servers; only the
credential *resolvers* differ per host. `@schemavaults/openapi-docs-ui` renders the
generated document (routes, permissions, auth details) as browsable docs.

## Install

```bash
bun add @schemavaults/openapi-operations
```

## Defining operations

```ts
import {
  z,
  createOperationDefiner,
  requireAuth,
  publicAccess,
  schemaVaultsAccessTokenBearerScheme,
} from "@schemavaults/openapi-operations";

// Bind the per-request context and resolved-user types once per app.
const defineOperation = createOperationDefiner<{ dbh: Kysely<AuthDatabase> }, UserData>();

const AppSchema = z
  .object({ app_id: z.string().uuid(), name: z.string() })
  .openapi("App"); // emitted under components.schemas.App

export const getApp = defineOperation({
  method: "get",
  path: "/api/apps/{app_id}", // OpenAPI style placeholders
  summary: "Get an app",
  tags: ["apps"],
  auth: requireAuth({
    schemes: [schemaVaultsAccessTokenBearerScheme],
    routeGuard: "authenticated", // or "admin"
    requiredScopes: ["email"],   // token scope claim must include these
    organization: { parameter: "organization_id", roles: ["owner", "admin"] }, // optional
  }),
  request: {
    params: z.object({ app_id: z.string().uuid() }),
    query: z.object({ include: z.union([z.string(), z.array(z.string())]).optional() }),
    headers: z.object({ "x-trace": z.string().optional() }),
    // body: { contentType: "application/json", schema: ... } (POST/PUT/PATCH/DELETE only)
  },
  responses: {
    200: { description: "The app", schema: AppSchema },
    404: { description: "Not found", schema: ErrorSchema },
  },
  handler: async (ctx) => {
    // ctx.params / ctx.query / ctx.headers / ctx.body are validated & typed
    // ctx.auth is the AuthPrincipal (null only on publicAccess() operations)
    // ctx.context is whatever createOperationsApp({ context }) produced
    const app = await ctx.context.dbh.selectFrom("APPS")...;
    if (!app) return ctx.json(404, { success: false, message: "No such app" });
    return ctx.json(200, app); // status + body are checked against `responses`
  },
});

export const health = defineOperation({
  method: "get",
  path: "/api/health",
  summary: "Liveness probe",
  auth: publicAccess(),
  responses: { 200: { description: "ok", schema: z.object({ ok: z.literal(true) }) } },
  handler: (ctx) => ctx.json(200, { ok: true }),
});
```

`defineOperationGroup({ pathPrefix, tags, operations })` applies a shared prefix and tags.
Throw `new OperationError(status, { error, message })` from a handler to short-circuit.

### Auth schemes

An `AuthSchemeDefinition` is a named OpenAPI security scheme plus docs metadata. Built-ins:

| Export | Scheme |
| --- | --- |
| `schemaVaultsAccessTokenBearerScheme` | `Authorization: Bearer <access token>` |
| `schemaVaultsAccessTokenCookieScheme(cookieName)` | first-party access token cookie |
| `schemaVaultsRefreshTokenCookieScheme(cookieName)` | auth-server session cookie |
| `oidcClientSecretBasicScheme` / `oidcClientSecretPostScheme` | OAuth 2.0 client authentication |
| `apiKeyHeaderScheme(name, header)` | static API key |
| `defineAuthScheme({...})` | anything else |

Schemes describe *how* credentials are transported; verification is a per-host
`AuthResolver` (below). The OpenAPI document carries the standard `security`
requirement per operation and an `x-schemavaults-auth` extension with the route guard,
required scopes and organization role so docs can display them.

## Generating the OpenAPI document

```ts
import { buildOpenApiDocument } from "@schemavaults/openapi-operations";

export const openApiDocument = buildOpenApiDocument({
  info: { title: "SchemaVaults Auth API", version: "1.0.0" },
  servers: [{ url: "https://auth.schemavaults.com" }],
  tags: [{ name: "apps", description: "Client applications" }],
  operations: [getApp, health],
});
```

## Serving with Hono on Vercel / Next.js

```ts
import { createOperationsApp, toNextRouteHandlers } from "@schemavaults/openapi-operations";

const app = createOperationsApp<{ dbh: Kysely<AuthDatabase> }, UserData>({
  operations: [getApp, health],
  context: async () => ({ dbh: await getDbh() }),
  authResolvers: {
    // keyed by scheme name; return null when no credential for that scheme is present
    "schemavaults-access-token": async (c) => {
      const token = c.req.header("authorization")?.replace(/^Bearer /, "");
      if (!token) return null;
      const user = await verifyAccessToken(token); // throw OperationError(401, ...) if invalid
      return {
        scheme: "schemavaults-access-token",
        user,
        isAdmin: user.admin,
        scope: user.scope ?? null,
        getOrganizationRole: (orgId) => lookupMembershipRole(user.uid, orgId),
      };
    },
  },
  // Served at GET /openapi.json. Pass a function to build it per request,
  // e.g. to set `servers` from the incoming Host / X-Forwarded-* headers.
  openapi: { document: openApiDocument },
});

// app/api/[[...route]]/route.ts
export const runtime = "nodejs";
export const { GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS } = toNextRouteHandlers(app);

// or a plain Vercel function: api/[[...route]].ts
export default toVercelHandler(app);
```

### One route file per operation

A catch-all is not required. To give every operation its own Next.js `route.ts`
(or Vercel function file) while still serving one OpenAPI document that lists all of
them, bind the shared runtime configuration and the full operation catalogue once with
`createOperationsAppFactory()` and build a small app per route file from it:

```ts
// src/lib/api/app.ts
import { createOperationsAppFactory, operationHttpMethods, toNextRouteHandlers } from "@schemavaults/openapi-operations";

export const operations = [getApp, health]; // the catalogue buildOpenApiDocument() is given
export const api = createOperationsAppFactory<{ dbh: Kysely<AuthDatabase> }, UserData>({
  operations,
  authResolvers,
  context: async () => ({ dbh: await getDbh() }),
});

// app/api/apps/[app_id]/route.ts   (Next.js segment [app_id] ↔ OpenAPI {app_id})
export const runtime = "nodejs";
export const { GET } = toNextRouteHandlers(api.app([getApp]), operationHttpMethods([getApp]));

// app/api/health/route.ts
export const { GET } = toNextRouteHandlers(api.app([health]), operationHttpMethods([health]));

// app/api/openapi.json/route.ts
export const { GET } = toNextRouteHandlers(
  api.openApiDocumentApp({ path: "/api/openapi.json", document: openApiDocument }),
  ["get"],
);
```

Each app routes on the full request pathname, so no `basePath` is needed and the
dynamic segment is parsed by the app itself (Next.js' `params` are never read).
`operationHttpMethods()` exports only the methods the operations declare, leaving 405s
for the rest to Next.js. The factory validates the whole catalogue up front (unique
operations, a resolver for every scheme) and `api.app()` throws for an operation that
is not in it, so a route file cannot serve something the document does not describe.
The reverse (a documented operation with no route file) is a file-layout question;
the example resource server in this repository checks it with a small `bun test`.

Per request the app: resolves the context, tries each accepted scheme's resolver in
order (401 + `WWW-Authenticate` if none yields a principal), enforces the route guard
(403), required scopes (403 `insufficient_scope`), organization membership (403), then
validates params/query/headers/body (400 with zod issues, 415 on media type mismatch)
and finally calls the handler. Errors use the `{ success: false, error, message }`
envelope.

## Scripts

```bash
bun run build      # tsc + tsc-alias → dist/
bun run test       # bun test
bun run lint
bun run typecheck
```
