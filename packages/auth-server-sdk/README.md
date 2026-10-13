# @schemavaults/auth-server-sdk

TypeScript SDK for SchemaVaults Auth Server and Resource Server API backends.

## CLI

```bash
bunx @schemavaults/auth-server-sdk codegen [options]
```

Generates the auth pages (`login`, `register`, `logout`, `authorize`, `error`),
the auth session route (`session/[action]/route.ts`, see below) and the
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

## Auth session route (refresh token in a first-party HTTP-only cookie)

`createAuthSessionRouteHandler()` (`@schemavaults/auth-server-sdk/auth-session-route`)
serves the browser SDK's token, whoami and logout requests from the app's own
origin (`<route>/token`, `<route>/whoami`, `<route>/logout`) and forwards them
to the auth server. The refresh token is kept in an HTTP-only,
`SameSite=Strict` cookie on the app's own domain and is never returned to the
page, so:

- page scripts (an XSS payload included) can never read or exfiltrate it;
- it is a first-party cookie, which browsers that block third-party cookies
  (Safari, every iOS browser) keep. The auth server's own cookie would be a
  third-party cookie for an app on another site.

The codegen writes it to `auth/session/[action]/route.ts`:

```ts
import { createAuthSessionRouteHandler } from "@schemavaults/auth-server-sdk/auth-session-route";

const handler = createAuthSessionRouteHandler();
export { handler as GET, handler as POST };
export const dynamic = "force-dynamic";
```

and the generated `auth-provider.tsx` points the SDK at it
(`session_route_uri="/auth/session"` on `<AuthProvider>`; pass
`session_route_uri={null}` to the generated provider to opt out). The route
reads `SCHEMAVAULTS_CLIENT_APP_ID`, `SCHEMAVAULTS_APP_ENVIRONMENT` and
`SCHEMAVAULTS_AUTH_SERVER_URL` (or the environment's default auth server); the
cookie is `Secure` outside development/test. It refuses cross-origin requests
(`Origin` / `Sec-Fetch-Site` checks) and serves only its own app's
`authorization_code` and `refresh_token` grants.

The auth server rate-limits refresh grants per IP; proxied through the route,
they count against the app server's IP.

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
