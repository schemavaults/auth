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

Schemas built by OTHER packages (e.g. `@schemavaults/auth-common`) may have been constructed
before this package installed the `.openapi()` extension (zod v4 copies prototype methods onto
each instance at construction time), in which case `schema.openapi(...)` throws at module load
depending on import order. Use `withOpenApi(schema, refId?, metadata)` for them:

```ts
import { withOpenApi } from "@schemavaults/openapi-operations";
export const Organization = withOpenApi(organizationDefinitionSchema, "Organization", { description: "..." });
```

Request bodies take two extra flags:

- `lenientContentType: true` also parses bodies labelled `text/plain` (or carrying no
  `Content-Type` at all) as the declared media type. Browsers send
  `text/plain;charset=UTF-8` for `fetch(url, { body: JSON.stringify(x) })` without an
  explicit header, so JSON endpoints with such callers need it.
- `documentOnly: true` describes the body in the OpenAPI document but leaves the
  request untouched: `ctx.body` is `undefined` and the handler reads `ctx.request`
  itself. For endpoints whose parsing / error format is mandated by a protocol (the
  OAuth 2.0 token endpoint's `{ error, error_description }`, ...).

### Auth schemes

An `AuthSchemeDefinition` is a named OpenAPI security scheme plus docs metadata. Built-ins:

| Export | Scheme | Principal |
| --- | --- | --- |
| `schemaVaultsAccessTokenBearerScheme` | `Authorization: Bearer <access token>` | user |
| `schemaVaultsAccessTokenCookieScheme(cookieName)` | first-party access token cookie | user |
| `schemaVaultsRefreshTokenCookieScheme(cookieName)` | auth-server session cookie | user |
| `oidcClientSecretBasicScheme` / `oidcClientSecretPostScheme` | OAuth 2.0 client authentication | any |
| `apiKeyHeaderScheme(name, header)` | static API key | any |
| `defineAuthScheme({...})` | anything else | as declared |

Schemes describe *how* credentials are transported; verification is a per-host
`AuthResolver` (below). The OpenAPI document carries the standard `security`
requirement per operation and an `x-schemavaults-auth` extension with the route guard,
required scopes and organization role so docs can display them.

#### User-bearing schemes: non-nullable `ctx.auth.user`

`AuthPrincipal.user` is `TUser | null` because a principal may be a non-user credential
(client credentials, an API key). A scheme whose resolver *always* identifies a user
declares `principal: "user"` (the three SchemaVaults token schemes do), and when every
scheme an operation accepts is such a scheme, its handler gets `ctx.auth.user` typed as
`TUser`:

```ts
const userSchemes = [schemaVaultsAccessTokenBearerScheme, accessTokenCookieScheme] as const;

export const me = defineOperation({
  auth: requireAuth({ schemes: userSchemes }), // keep the tuple type: `as const`, no widening
  handler: (ctx) => ctx.json(200, { uid: ctx.auth.user.uid }), // UserData, not UserData | null
  // ...
});
```

Keep the scheme list's tuple type (a helper returning `RequiredOperationAuth` without
its type parameter, or a scheme annotated as `AuthSchemeDefinition<"name">` instead of
`AuthSchemeDefinition<"name", "user">`, widens it back to nullable). The runtime enforces
the declaration: a `principal: "user"` scheme whose resolver returns a principal without
a user is refused with 401. For operations that also accept non-user schemes,
`requireUser(ctx.auth)` narrows and throws a 401 `OperationError` otherwise.

Resource servers verifying SchemaVaults access tokens do not write resolvers for these
schemes themselves: `createSchemaVaultsAuthResolvers()` from
`@schemavaults/auth-server-sdk/openapi-operations` returns them, keyed by scheme name,
built on the server SDK's `RouteGuardFactory` and the auth server's JWKS.

### The error envelope

Every error the runtime produces, and every `OperationError` a handler throws, is
`{ success: false, error, message, issues?, details? }`. `OperationErrorBodySchema` is
that envelope as a zod schema (registered as `components.schemas.OperationError`, with
`OperationValidationIssueSchema` as `OperationValidationIssue`), for the 404 / 409 / ...
responses a handler declares:

```ts
responses: {
  200: { description: "App", schema: AppSchema },
  404: { description: "No such app", schema: OperationErrorBodySchema },
},
handler: (ctx) => {
  if (!app) throw new OperationError(404, { error: "not_found", message: "No such app" });
  // ...
},
```

## Generating the OpenAPI document

```ts
import { buildOpenApiDocument } from "@schemavaults/openapi-operations";

export const openApiDocument = buildOpenApiDocument({
  info: { title: "SchemaVaults Auth API", version: "1.0.0" },
  servers: [{ url: "https://auth.schemavaults.com" }],
  tags: [{ name: "apps", description: "Client applications" }],
  operations: [getApp, health],
  // Also document the responses the runtime produces on its own (below).
  documentRuntimeResponses: true,
});
```

`buildOpenApiDocument` emits the responses each operation declares. The runtime also
answers on its own with 400 (validation of params / query / headers / body, missing
organization parameter), 401 (protected operations; with `WWW-Authenticate`), 403 (admin
route guard, required scopes, organization role), 415 (operations with a validated body)
and 500, all with the `OperationError` envelope. `documentRuntimeResponses: true` merges
those into every operation that can produce them; a response the operation declares for
the same status takes precedence. `runtimeErrorResponses(operation)` returns the set for
one operation (and `withRuntimeErrorResponses(operation)` a copy with them merged) when
you assemble responses yourself.

## Serving with Hono on Vercel / Next.js

```ts
import { createOperationsApp, toNextRouteHandlers } from "@schemavaults/openapi-operations";

const app = createOperationsApp<{ dbh: Kysely<AuthDatabase> }, UserData>({
  operations: [getApp, health],
  // Built per request BEFORE credentials are resolved (keep it cheap, open
  // expensive resources lazily); released by disposeContext afterwards.
  context: async () => ({ dbh: await getDbh() }),
  disposeContext: async ({ dbh }) => dbh.destroy(),
  authResolvers: {
    // keyed by scheme name; return null when no credential for that scheme is
    // present. The third argument is the per-request context.
    "schemavaults-access-token": async (c, _scheme, { dbh }) => {
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
  // Unexpected failures: log / persist them before the generic 500 goes out.
  onError: (error, c, { operation, context }) => reportException(error, operation.operationId),
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
The reverse (a documented operation with no route file, or one in the wrong folder) is a
file-layout question; `checkNextAppRouterRoutes()` from
`@schemavaults/openapi-operations/nextjs/app-router-routes` answers it for a `bun test`
or a generation script. Given the catalogue and the `app` directory it verifies that every
`operation.ts` / `operations.ts` under `app/api/**` exports operations that are in the
catalogue and declare the path its folder serves (`[id]` ↔ `{id}`, `(group)` segments
ignored, catch-all segments rejected), that a sibling `route.ts` exists, that every
catalogue entry comes from such a file, and that every `route.ts` serves a catalogued path:

```ts
// src/lib/api/routes.test.ts
import { checkNextAppRouterRoutes } from "@schemavaults/openapi-operations/nextjs/app-router-routes";

test("route files and the catalogue agree", async () => {
  const report = await checkNextAppRouterRoutes({
    operations,                                   // the catalogue
    appDirectory: path.resolve(import.meta.dir, "../../app"),
    ignoredRoutePaths: ["/api/openapi.json"],     // route files that are not operations
  });
  expect(report.problems).toEqual([]);
});
```

`assertNextAppRouterRoutes()` throws an `Error` listing every problem instead, for
scripts. Options: `apiDirectory` (default `api`), `operationFileNames` (default
`["operation.ts", "operations.ts"]`), `routeFileName`, `ignoredRouteDirectories` (e.g.
`api/auth/[...nextauth]`), `importModule` (default dynamic `import()`), `catalogueLabel`.

Per request the app: resolves the context, tries each accepted scheme's resolver in
order (401 + `WWW-Authenticate` if none yields a principal), enforces the route guard
(403), required scopes (403 `insufficient_scope`), organization membership (403), then
validates params/query/headers/body (400 with zod issues, 415 on media type mismatch)
and finally calls the handler. Errors use the `{ success: false, error, message }`
envelope (`OperationErrorBodySchema`). An `OperationError` thrown from a different copy of
this package (isolated installs can load it twice) is recognised structurally
(`isOperationError()`), so it still short-circuits with its status and body.

## Scripts

```bash
bun run build      # tsc + tsc-alias → dist/
bun run test       # bun test
bun run lint
bun run typecheck
```
