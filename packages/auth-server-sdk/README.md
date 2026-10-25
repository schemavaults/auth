# @schemavaults/auth-server-sdk

TypeScript SDK for SchemaVaults Auth Server and Resource Server API backends.

## CLI

```bash
bunx @schemavaults/auth-server-sdk codegen [options]
```

Generates the auth pages (`login`, `register`, `logout`, `authorize`, `error`),
the auth session routes (`session/{token,whoami,logout}/route.ts`, see below) and the
`auth-provider.tsx` into your Next.js App Router project.

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

## Defining API scopes from code (`sync-scopes`)

A resource server can keep its API scopes (the OAuth 2.0 scope values clients ask
for, e.g. `notes:read`) in code instead of typing them into the auth server console.
It sends its whole scope list to the auth server
(`PUT /api/resource-server/apis/{api_server_id}/scopes`), authenticated with the
same JWKS access key it already holds. The auth server creates the missing scopes and
updates changed descriptions (and `allow_dynamic_clients`, where an entry gives it)
in one transaction. **It never deletes a scope**: deleting one drops users' consents
and the per-app allowances set for it, so scopes the list leaves out are reported as
`not_in_manifest` and stay a decision for a person in the console. Per-app scope
allowances, the API server's dynamic-client policy and the dynamic client
registration setting are not touched either.

Write the list as a JSON manifest. Its `$schema` names the JSON Schema every auth
server serves at `/json-schema/api-server-scopes.json`, so editors (VS Code,
JetBrains, ...) auto-complete and check it while you type:

```json
{
  "$schema": "https://auth.schemavaults.com/json-schema/api-server-scopes.json",
  "scopes": [
    { "scope": "notes:read", "description": "Read your notes." },
    { "scope": "notes:write", "description": "Create, edit and delete your notes.", "allow_dynamic_clients": true }
  ]
}
```

- `scope`: one RFC 6749 scope-token (printable ASCII without spaces, `"` or `\`), at
  most 128 characters, never an OpenID Connect scope name (`openid`, `profile`, ...),
  each value listed once. A scope cannot be renamed (define a new one and delete the
  old one in the console).
- `description`: 1 to 256 characters, shown on the consent screen.
- `allow_dynamic_clients` (optional): whether dynamically registered clients may be
  granted the scope. Omit it to keep the current value (so a choice made in the
  console stands); a new scope defaults to `true`.
- At most 100 scopes per API server in total.

```bash
bunx @schemavaults/auth-server-sdk sync-scopes --init                 # writes ./api-scopes.json
bunx @schemavaults/auth-server-sdk sync-scopes --manifest ./api-scopes.json --dry-run
bunx @schemavaults/auth-server-sdk sync-scopes --manifest ./api-scopes.json
bunx @schemavaults/auth-server-sdk sync-scopes --manifest ./api-scopes.json --check   # CI: exit 2 on drift
```

| Flag | Effect |
| --- | --- |
| `--manifest <path>` | The manifest. Checked locally with the auth server's own schema before anything is sent |
| `--init` | Writes a starter manifest (to `--manifest`, default `./api-scopes.json`) whose `$schema` is the configured auth server's; never overwrites |
| `--dry-run` | Prints what would change, writes nothing |
| `--check` | Dry run that exits 2 when anything would be created or updated |
| `--env-file <path>` | Loads `SCHEMAVAULTS_API_SERVER_ID`, `SCHEMAVAULTS_AUTH_SERVER_URL`, `SCHEMAVAULTS_AUTH_JWKS_ACCESS_PRIVATE_KEY` and `SCHEMAVAULTS_APP_ENVIRONMENT` from a file first; its values win over the environment's |

It prints one line per created (`+`), updated (`~`) and `not_in_manifest` (`!`, a
warning only) scope. Exit codes: 0 on success, 1 on any error (an invalid manifest,
missing settings, a refusal), 2 for drift under `--check`. It reads the same settings
as `createSchemaVaultsAuthResolvers()`.

The CLI runs on Node, so it reads JSON manifests only. TypeScript apps can call the
function from a script instead (`{ [scope]: description }` is accepted as a shorthand
that keeps every scope's current `allow_dynamic_clients`):

```ts
import { syncApiServerScopes, ApiScopeSyncFailedError } from "@schemavaults/auth-server-sdk/api-scopes";

const result = await syncApiServerScopes({
  scopes: [
    { scope: "notes:read", description: "Read your notes." },
    { scope: "notes:write", description: "Create, edit and delete your notes." },
  ],
  dry_run: false,
  // Defaults: SCHEMAVAULTS_API_SERVER_ID, getSchemaVaultsAuthServerUrl(),
  // loadJwksAccessPrivateKey() (SCHEMAVAULTS_AUTH_JWKS_ACCESS_PRIVATE_KEY).
});
// result: { api_server_id, dry_run, created, updated (with `previous`), unchanged, not_in_manifest }
```

A list that fails the schema throws `InvalidApiScopeManifestError` without calling the
auth server; any other answer than 200 throws `ApiScopeSyncFailedError` with its
`status` and `code` (e.g. `validation_error`, `invalid_assertion`, `too_many_scopes`
(409), `hardcoded_api_server`). `API_SERVER_SCOPES_JSON_SCHEMA_PATH` is exported for
tools that build the schema URL from the configured auth server.

**Sync before you deploy, once per environment.** No client can be granted a scope
until it exists, so run the sync before shipping code whose `requiredScopes` name a
new scope. Each auth server deployment (staging, production) is synced separately with
the API server's key for that deployment, e.g. `--env-file .env.staging` then
`--env-file .env.production`. An auth server older than scope sync answers 404.

## Auth session routes (refresh token in a first-party HTTP-only cookie)

`@schemavaults/auth-server-sdk/auth-session-route` serves the browser SDK's
token, whoami and logout requests from the app's own origin and forwards them
to the auth server, one route handler each:

| Route (codegen path) | Factory | Method |
| --- | --- | --- |
| token (`/auth/session/token`) | `createAuthSessionTokenRoute()` | `POST` (authorization code and refresh grants) |
| whoami (`/auth/session/whoami`) | `createAuthSessionWhoamiRoute()` | `GET` |
| logout (`/auth/session/logout`) | `createAuthSessionLogoutRoute()` | `POST` |

The refresh token is kept in an HTTP-only, `SameSite=Strict`, host-only cookie
on the app's own host (`__Host-schemavaults_refresh_token_<app>`: the
`__Host-` prefix makes browsers refuse any such cookie that carries a `Domain`
or a narrower `Path`, so a sibling subdomain cannot plant one; a request that
carries the cookie twice is treated as having no session), and is never
returned to the page, so:

- page scripts (an XSS payload included) can never read or exfiltrate it;
- it is a first-party cookie, which browsers that block third-party cookies
  (Safari, every iOS browser) keep. The auth server's own cookie would be a
  third-party cookie for an app on another site.

The codegen writes one route file per action, e.g.
`auth/session/token/route.ts`:

```ts
import { createAuthSessionTokenRoute } from "@schemavaults/auth-server-sdk/auth-session-route";

export const { POST } = createAuthSessionTokenRoute();
export const dynamic = "force-dynamic";
```

(`auth/session/whoami/route.ts` exports `{ GET }` from
`createAuthSessionWhoamiRoute()`, `auth/session/logout/route.ts` exports
`{ POST }` from `createAuthSessionLogoutRoute()`),
and the generated `auth-provider.tsx` points the SDK at each of them
(`session_routes={AUTH_SESSION_ROUTE_PATHS}` on `<AuthProvider>`, one path per
route; pass `session_routes={null}` to the generated provider to opt out). The
routes read `SCHEMAVAULTS_CLIENT_APP_ID`, `SCHEMAVAULTS_APP_ENVIRONMENT` and
`SCHEMAVAULTS_AUTH_SERVER_URL` (or the environment's default auth server); the
cookie is `Secure` outside development/test. They refuse cross-origin requests
(`Origin` / `Sec-Fetch-Site` checks), and the token route serves only its own
app's `authorization_code` and `refresh_token` grants.

The auth server rate-limits refresh grants per IP; proxied through the token
route, they count against the app server's IP.

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

`createSchemaVaultsAuthResolvers()` (see below) also accepts the resource URL
in `SCHEMAVAULTS_RESOURCE_URL` without configuration, with or without a
trailing slash; elsewhere, list them yourself with `getSchemaVaultsResourceUrl()`
(null when unset) and `resourceUrlAudiences(url)` from
`@schemavaults/auth-server-sdk/oauth-protected-resource`.

## Protected resource metadata (RFC 9728)

OAuth clients that start from nothing but your server's URL (MCP clients do)
discover which authorization server to use, and which `resource` URL to request
tokens for, from `/.well-known/oauth-protected-resource`.
`@schemavaults/auth-server-sdk/oauth-protected-resource` serves that document. In
Next.js, `app/.well-known/oauth-protected-resource/[[...path]]/route.ts` (the
optional catch-all also answers the path-suffixed URLs of RFC 9728 §3.1, e.g.
`/.well-known/oauth-protected-resource/mcp` for `https://api.example.com/mcp`):

```ts
import { createOAuthProtectedResourceMetadataRoute } from "@schemavaults/auth-server-sdk/oauth-protected-resource";

export const { GET, OPTIONS } = createOAuthProtectedResourceMetadataRoute({
  resource_name: "My API",         // optional
  resource_documentation: "/docs", // optional; paths resolve against the resource URL
  scopes_supported: ["mcp:tools"], // optional
});
export const dynamic = "force-dynamic";
```

```json
{
  "resource": "https://api.example.com/mcp",
  "authorization_servers": ["https://auth.example.com"],
  "bearer_methods_supported": ["header"],
  "resource_name": "My API",
  "resource_documentation": "https://api.example.com/docs"
}
```

- `resource` is `SCHEMAVAULTS_RESOURCE_URL` (or the `resource` option): an
  absolute http(s) URL without query or fragment, `https` in production and
  staging. It is what clients send as RFC 8707 `resource`, so it becomes the
  `aud` of their access tokens; the auth resolvers accept it (above). On the
  auth server the URL must resolve to your API server, or token requests for it
  fail with `invalid_target`: register its origin as one of the API server's
  domains, with `prefix` resource URL matching when the resource URL has a path
  (`exact` suffices when it is the origin itself), and turn on
  `allow_dynamic_clients` for dynamically registered clients.
- `authorization_servers` is the auth server URL (`SCHEMAVAULTS_AUTH_SERVER_URL`,
  or the environment's default), which is the auth server's issuer.
- The document is public: `Access-Control-Allow-Origin: *`, cached for an hour,
  and `OPTIONS` answers CORS preflights.
- Without a resource URL the route answers 404 (no metadata is published); a
  path-suffixed request for a path that is neither the resource's nor below it is
  a 404 too; an invalid resource URL is a 500.

`buildOAuthProtectedResourceMetadata()` and `oauthProtectedResourceMetadataUrl()`
(the RFC 9728 §3.1 metadata URL of a resource URL) are exported for other hosts.

## When the JWKS cannot be loaded

Route guards verify tokens with the JWKS that `RemoteJwtKeyManager` downloads from the
auth server using your JWKS access key. When the auth server refuses that download (a 4xx:
the key is not the API server's active one, or the API server id is wrong) or
`SCHEMAVAULTS_AUTH_JWKS_ACCESS_PRIVATE_KEY` is not a usable private key, the key manager
throws `JwtKeyManagerMisconfigurationError` (`reason`: `jwks_download_refused` /
`jwks_access_private_key_unusable`). No token can verify until the configuration is fixed,
so the guards report a server misconfiguration instead of an unauthenticated request
(signing in again would only mint another token the server cannot verify, and the browser
would loop through the login flow):

- `withAuthenticatedServerComponentRouteGuard` redirects to the codegen'd error page,
  `/auth/error?error=500&error_id=server_misconfiguration` (or your `error_page_url`);
- `withAuthenticatedApiRouteGuard` answers 500;
- `RouteGuardFactory.createGuardFromTokenSources()` and `decodeJWTsWithKeyManager()`
  throw the error when no token verified.

Outages (5xx, 408, 429, network errors) are not misconfigurations: the request is still
treated as unauthenticated. The cause is logged on the server.

## Introspecting access tokens (RFC 7662)

Local verification (route guards, `decodeJWTsWithKeyManager`) proves a token is
authentic and unexpired, but cannot see what happened after it was issued: a
logout, a password reset, a disabled account, the user de-authorizing the client
app, or the app being disconnected from your API server. `introspectToken()` asks
the auth server, authenticating with your JWKS access key (`private_key_jwt`: a
fresh single-use JWKS access assertion per call):

```ts
import { introspectToken, loadJwksAccessPrivateKey, getAuthServerUrl } from "@schemavaults/auth-server-sdk";

const result = await introspectToken({
  auth_server_url: getAuthServerUrl(),
  api_server_id: process.env.SCHEMAVAULTS_API_SERVER_ID!,
  jwks_access_private_key: await loadJwksAccessPrivateKey(),
  token: accessToken,
});
if (result.active) {
  result.uid;       // platform user id
  result.sub;       // OIDC subject `<auth_server_app_id>|<uid>`
  result.client_id; // the client app the token was issued to
  result.scope;     // granted scope, if any
}
```

Only access tokens minted for your API server (its id, or one of its RFC 8707
resource URLs, as `aud`) can come back active; everything else is `{ active: false }`.
A refused request (e.g. a JWKS access key that is not your active one) throws.
Each call is a round trip to the auth server, so reserve it for requests where
revocation must be honoured immediately.

## `UserData.sub`

`UserData.sub` is the OIDC subject `<auth_server_app_id>|<uid>` (the value the
id_token, userinfo and introspection report); use `uid` for the platform user id.
The access tokens themselves still carry the bare uid as `sub`, so older SDK
versions keep verifying them; `userDataSchema` upgrades a bare-uuid `sub` with
`SCHEMAVAULTS_AUTH_SERVER_APP_ID` (default `schemavaults-auth`).

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
    acceptedAudiences: ["https://mcp.example.com/mcp"], // more RFC 8707 resource URLs; SCHEMAVAULTS_RESOURCE_URL is always accepted (see above)
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
  URL), an unusable key, or a JWKS download the auth server refuses is 500
  `auth_not_configured` with a message naming the cause, never a silent pass. With no
  credential at all the operations runtime still answers 401 + `WWW-Authenticate`.
- The principal is `{ scheme, user, isAdmin: user.admin === true, scope,
  getOrganizationRole, listOrganizationMemberships }`. `getOrganizationRole` validates the
  id and asks the auth server (`isUserInOrganization`); `listOrganizationMemberships()`
  lists the user's memberships (`listUserOrganizations`, the same
  `OrganizationMembershipRoleDetails` shape as `/api/me/organizations`). Both sign a JWKS
  access assertion with the JWKS access key and forward the token the user presented in
  `X-Subject-Token`.

### Organization memberships

By default an API server only sees memberships of the organization that owns it:
`getOrganizationRole` for any other organization fails (the auth server answers 403) and
`listOrganizationMemberships()` returns at most that one membership. A multi-tenant
platform service that serves every organization (e.g. a registry) needs a platform
administrator to set its API server's organization membership visibility to
`all_organizations` (`PUT /api/apis/{api_server_id}/organization-membership-visibility`
on the auth server). Lookups outside the owning organization are then answered only
for a user who presents an active access token for the API server, which the resolvers
forward automatically; outside operation handlers, pass it yourself:

```ts
import { isUserInOrganization, listUserOrganizations } from "@schemavaults/auth-server-sdk";

const role = await isUserInOrganization(authServerUrl, apiServerId, jwksAccessKey, uid, "acme", {
  subject_token: accessToken, // the user's access token for this API server
});
const memberships = await listUserOrganizations({
  auth_server_url: authServerUrl,
  api_server_id: apiServerId,
  jwks_access_private_key: jwksAccessKey,
  uid,
  subject_token: accessToken,
});
```

`AccessTokenCookieName(apiServerId)` / `AccessTokenExpiryCookieName(apiServerId)` are
exported from the package index too, so the cookie scheme can be declared without a
direct dependency on `@schemavaults/auth-common`.
