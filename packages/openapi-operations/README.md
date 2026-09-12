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
  openapi: { document: openApiDocument }, // served at GET /openapi.json
});

// app/api/[[...route]]/route.ts
export const runtime = "nodejs";
export const { GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS } = toNextRouteHandlers(app);

// or a plain Vercel function: api/[[...route]].ts
export default toVercelHandler(app);
```

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
