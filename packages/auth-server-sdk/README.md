# @schemavaults/auth-server-sdk

TypeScript SDK for SchemaVaults Auth Server and Resource Server API backends.

## CLI

```bash
bunx @schemavaults/auth-server-sdk codegen [options]
```

Generates the auth pages (`login`, `register`, `logout`, `authorize`, `error`)
and the `auth-provider.tsx` into your Next.js App Router project.

### Options

- `--client-output-dir <path>` — Custom output directory for the generated
  client `auth/` files. Defaults to `<app>/auth` (e.g. `src/app/auth` or
  `app/auth`). When set, the path is treated as the auth directory itself, so
  you can place the generated files inside a Next.js route group:

  ```bash
  bunx @schemavaults/auth-server-sdk codegen --client-output-dir src/app/\(client\)/auth
  ```

  Relative paths are resolved against the current working directory.
- `--templates-dir <path>` — Use a custom codegen templates directory instead
  of the templates bundled with the SDK.
- `--debug` — Enable debug logging.
- `--help`, `-h` — Show help.
- `--version`, `-v` — Show package name and version.

## Accepting resource-URL token audiences

Access tokens are normally minted with your API server id as their `aud`.
A client that requested its token with an RFC 8707 `resource` **URL** (MCP
clients do, and so do clients registered through RFC 7591 dynamic client
registration) receives a token whose `aud` is that URL instead. To accept
such tokens, list the URL(s) your server is known by:

```ts
new RouteGuardFactory({ environment, accepted_audiences: ["https://mcp.example.com/mcp"] });
// or, for the middleware:
new SchemaVaultsServerMiddleware({ ..., accepted_audiences: ["https://mcp.example.com/mcp"] });
```

Keysets are still looked up by the API server id; only the `aud` comparison
changes, and only for tokens whose header names one of the listed URLs
(`resolveExpectedTokenAudience()`). Tokens with any other `aud` fail as
before.

## Auth resolvers for `@schemavaults/openapi-operations`

Resource servers that declare their API with
[`@schemavaults/openapi-operations`](../openapi-operations) need credential
resolvers for the SchemaVaults access-token schemes
(`schemaVaultsAccessTokenBearerScheme`, `schemaVaultsAccessTokenCookieScheme(...)`).
`createSchemaVaultsAuthResolvers()` returns them, keyed by scheme name, built on the
same `RouteGuardFactory` + remote JWKS verification `withAuthenticatedApiRouteGuard`
uses. `@schemavaults/openapi-operations` is an optional peer dependency: install it
alongside this package to use the sub-export.

```ts
// src/lib/api/app.ts
import { createSchemaVaultsAuthResolvers } from "@schemavaults/auth-server-sdk/openapi-operations";
import { createOperationsAppFactory } from "@schemavaults/openapi-operations";

export const api = createOperationsAppFactory<ApiContext, UserData>({
  operations,
  authResolvers: createSchemaVaultsAuthResolvers<ApiContext>({
    // all optional; environment-derived defaults are read on first request
    apiServerId,                 // default SCHEMAVAULTS_API_SERVER_ID
    environment,                 // default getAppEnvironment()
    acceptedAudiences: ["https://mcp.example.com/mcp"], // RFC 8707 resource URLs (see above)
    isTokenRevoked,              // optional revocation hook
  }),
});
```

Per request:

- `Authorization: Bearer <token>` (`schemavaults-access-token`): a malformed header is
  401 `invalid_request` with `WWW-Authenticate`; no header → the next scheme is tried.
- The access-token cookie `access_token_<api_server_id>`
  (`schemavaults-access-token-cookie`): accepts the JSON `{ token, exp, ... }` value the
  auth provider writes (skipped once `exp` has passed) and a raw JWT.
- A token that fails verification is 401 `invalid_token`; a revoked one (`isTokenRevoked`)
  401 `token_revoked`; a disabled account 403 `account_disabled`.
- A missing `SCHEMAVAULTS_AUTH_JWKS_ACCESS_PRIVATE_KEY` (or API server id / auth server
  URL) is 500 `auth_not_configured` with a message naming it, never a silent pass. With no
  credential at all the operations runtime still answers 401 + `WWW-Authenticate`.
- The principal is `{ scheme, user, isAdmin: user.admin === true, scope,
  getOrganizationRole }`; `getOrganizationRole` validates the id and asks the auth server
  (`isUserInOrganization`) with the JWKS access key.

`AccessTokenCookieName(apiServerId)` / `AccessTokenExpiryCookieName(apiServerId)` are
exported from the package index too, so the cookie scheme can be declared without a
direct dependency on `@schemavaults/auth-common`.
