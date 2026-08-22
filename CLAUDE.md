# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is the **SchemaVaults Auth Platform** monorepo - an authentication/authorization server built with Next.js 16 and React 19. It uses Turborepo with Bun workspaces for package management.

## Commands

### Development
```bash
bun install                              # Install all dependencies
bun run dev --filter @schemavaults/auth-server  # Run auth-server dev (port 6767)
bun run dev:server                       # Shortcut for the above
bun run dev:migrate                      # Run database migrations for dev auth-server
```

### Building
```bash
bun run build                            # Build all packages
bun run build:server                     # Build just auth-server
bun run build:packages                   # Build all auth packages in the packages/ directory
```

### Linting
```bash
bun run lint                                         # Lint all packages via Turborepo
bun run lint --filter @schemavaults/auth-server      # Lint auth-server only
bun run lint --filter @schemavaults/auth-client-sdk  # Lint specific package
```

### Type Checking
```bash
bun run typecheck                                          # Type check all packages via Turborepo
bun run typecheck --filter @schemavaults/auth-server       # Type check auth-server only
bun run typecheck --filter @schemavaults/auth-client-sdk   # Type check specific package
bun run typecheck --filter @schemavaults/auth-server-sdk   # Type check specific package
bun run typecheck --filter @schemavaults/auth-common       # Type check specific package
bun run typecheck --filter @schemavaults/jwt               # Type check specific package
bun run typecheck --filter @schemavaults/app-definitions   # Type check specific package
bun run typecheck --filter @schemavaults/auth-ui           # Type check specific package
bun run typecheck --filter @schemavaults/e2e-auth-tests    # Type check test workspace
```

### One-off Commands
```bash
# We use bun, not npm/yarn
# So use bunx where you would use npx
bunx tsc --noEmit
# Raw bunx calls should be avoided where possible to ensure that you have permission! For typechecking / linting use the appropriate Turborepo commands added to the root package.json
```

### Testing
```bash
# Unit tests (per-package using bun test)
bun run test --filter @schemavaults/jwt              # Run tests in jwt package
bun run test --filter @schemavaults/auth-common      # Run tests in auth-common package
bun run test --filter @schemavaults/auth-client-sdk  # Run tests in auth-client-sdk package
bun run test --filter @schemavaults/auth-server-sdk  # Run tests in auth-server-sdk package
```

## Architecture

### Monorepo Structure
- **auth-server/**: Next.js 16 App Router application - the main auth server deployed at auth.schemavaults.com
- **packages/**: Shared TypeScript libraries published to npm & GitHub Packages
- **tests/e2e-auth-tests/**: Cypress E2E test suite
- **tests/example-nextjs-resource-server/**: Example Next.js resource server for testing login via OAuth2 PKCE flow

### Package Dependency Hierarchy
```
@schemavaults/app-definitions     ← Base types for apps/environments
        ↓
@schemavaults/auth-common         ← Shared auth types, middleware rules, PKCE, hashing
        ↓
@schemavaults/jwt                 ← JWT key management, token signing/verification (uses jose)
        ↓
@schemavaults/auth-server-sdk     ← Server-side middleware, route protection for resource servers
@schemavaults/auth-client-sdk     ← Client SDK for API calls to auth server
        ↓
@schemavaults/auth-react-provider ← React hooks/context for auth state (uses SWR)
        ↓
@schemavaults/auth-ui             ← React components for auth flows (login, register, etc.)
```

### auth-server Structure
- `src/app/` - Next.js App Directory
- `src/app/api/` - Next.js API routes (auth endpoints, admin endpoints, token management)
- `src/app/(client)/` - Client-side pages with route groups
- `src/app/(client)/(authenticated)/` - Routes requiring authentication
- `src/lib/auth-db/` - Database resource groups for users, organizations, apps, APIs, JWT keys
- `src/components/` - Next.js/React.js client components specific to the auth server
- `src/lib/AuthServerJwtKeysManager/` - JWT key lifecycle management

### Building UI Components

All user interfaces should be built using `@schemavaults/ui` and `@schemavaults/theme`. Most shadcn & radixui components are available from here.

### UI Components

- `@schemavaults/auth-ui` - React components for working with auth datatypes (e.g. users table, organizations table, apps table, APIs table)
- `@schemavaults/auth-server/src/components` - React components for auth-server flows (login, register, etc.)

### Database
Uses `@schemavaults/dbh` with Kysely for Postgres (Neon serverless compatible). Tables are managed via resource groups in `src/lib/auth-db/`. The `SCHEMAVAULTS_DBH_ADAPTER` env var (resolved at call time by `ServerlessDatabase` in `src/lib/auth-db/serverless-database.ts`) selects how the server connects: `postgres-neon-proxy` (default; Neon-compatible WebSocket proxy) or `postgres` (direct TCP `pg` Pool, used by the single-VM `deploy/` stack).

##### Starting development database
```bash
bun run dev:db
# you may also need to run migrations (if changing database schema or first run)
```

#### Database Migrations

##### Making changes to the database schema
- Make sure that the live database types are defined in `src/lib/auth-db/auth-database-types.ts`. New tables should be defined here.
- Database migrations are defined in `src/lib/auth-db/migrations/` to make the database match the live database types. New migrations are in the format `<5 digit chronological migration id>_<migration_name>.ts`. If the last update was `00012_my_twelth_migration.ts`, the next migration should be `00013_my_thirteenth_migration.ts`. Each migration file should have a `up` and `down` function that defines the migration and its reverse operation.

##### Database Migration in Development
Database migrations need to be run before starting the auth-server (if changing database schema or first run):
```bash
bun run dev:migrate
```

##### Database Migration for E2E tests
POST => `{api_server_base_url}/api/test/seed/migrate-test-environment-db`

The E2E Cypress tests will automatically run migrations before the test suite by using this endpoint.

### Environment Variables
Copy `auth-server/.env.example` to `.env.local`. Key variables:
- `POSTGRES_*` - Database connection
- `PRIVATE_GLOBAL_PASSWORD_SALT` - For password hashing
- `PRIVATE_SUPERUSER_INVITE_CODE` - Creates admin invite code on first registration

There is an interactive helper script for initializing environment variables for the development environment:
```bash
bun run dev:init-env
```

## White-label Branding

Text/color branding is env-var driven (`SCHEMAVAULTS_AUTH_SERVER_FRIENDLY_NAME`, `_DESCRIPTION`, `_THEME_COLOR_1/2`, resolved by `auth-server/src/lib/config/`; the friendly-name/description env resolution canonically lives in `@schemavaults/app-definitions` with the `lib/config/` modules as server-only delegates). Branding *images* (favicon, app icon, opengraph image) are administrator-uploadable at runtime: assets are stored base64 in the `server_branding_assets` table via the `BrandingAssetsRegistry` resource group (`auth-server/src/lib/auth-db/branding/`, Redis-cached) and served by the public `GET /branding/[asset]` route with ETag + cache-busted `?v=<content-hash>` URLs referenced from the root layout's `generateMetadata()` (`/favicon.ico` is rewritten to `/branding/favicon` in `next.config.ts`). When no custom asset is uploaded, the favicon/icon fall back to bundled defaults (`auth-server/public/branding-defaults/`, read+cached at serve time by `auth-server/src/lib/branding/default-assets/`) and the opengraph image is generated at request time with `next/og` from the friendly name, description, and theme colors (`auth-server/src/lib/branding/generated-og-image.ts`). Admins manage uploads on `/admin/settings` (`BrandingAssetsCard` in `auth-server/src/components/BrandingAssets/`) backed by `GET /api/admin/branding` and `PUT`/`DELETE /api/admin/branding/[asset]`. The app icon is also rendered in page content by the `<Logo />` client component (`auth-server/src/components/Logo.tsx`, used as the `DashboardLayout` logo and on the home page): the root layout resolves the cache-busted URL server-side via `resolveBrandingIconUrl()` (`auth-server/src/lib/branding/branding-metadata.ts`) and threads it to clients through the `AppIconUrlProvider`/`useAppIconUrl()` context (`auth-server/src/components/AppIconUrl/`). `<Logo />` requests downscaled variants (with a 2x `srcSet` for high-DPI displays) via the serving route's `?s=` square-resize param, bounded to the `BRANDING_ASSET_RESIZE_SIZES` allowlist in `branding-asset-version.ts` and resized server-side with `sharp` (`auth-server/src/lib/branding/resized-assets.ts`; Redis-cached for uploads, in-process for bundled defaults, falling back to the original bytes for non-raster content types or resize failures).

User-facing *copy* interpolates the friendly name rather than hardcoding "SchemaVaults": server-side code calls `getAuthServerFriendlyName()` directly (transactional email subjects/bodies — verification, password reset, MFA security alerts, team invitations, daily admin report — plus the TOTP issuer and WebAuthn RP display name), auth-server client components read it from the `useAuthServerFriendlyName()` context (mounted in the root layout via `AuthServerFriendlyNameProvider`), and shared `@schemavaults/auth-ui` cards/dialogs read the package's own `useAuthUiFriendlyName()` context (fed by `AuthServerFriendlyNameProvider`; defaults to "SchemaVaults Auth" when no `AuthUiFriendlyNameProvider` is mounted, e.g. in external resource servers). The transactional email sender identity is configurable with `SCHEMAVAULTS_AUTH_SERVER_EMAIL_FROM_ADDRESS` (a plain email address, applied as the default `from` in `sendEmailViaMailServer`; the mail-server's default sender is used when unset). The email identity claim embedded in internally-minted superuser access tokens (`spoofSuperuserAccessToken`, used to authorize with the mail-server) is database-driven via the `spoofed_superuser_email` server setting (`SERVER_SETTING_DEFINITIONS`, editable on `/admin/settings`, default `admin@schemavaults.com`).

The *owner organization* is also env-var driven: `SCHEMAVAULTS_AUTH_SERVER_OWNER_ORGANIZATION` (org ID, default `schemavaults`, throws if set but invalid) and `SCHEMAVAULTS_AUTH_SERVER_OWNER_ORGANIZATION_NAME` (display name, default "SchemaVaults"), resolved at call time by `getAuthServerOwnerOrganizationId()`/`getAuthServerOwnerOrganizationName()` in `@schemavaults/app-definitions` (server-side import surface: `auth-server/src/lib/config/auth-server-owner-organization.ts`). The auth server's own app/API definitions are built by the `getSchemaVaultsAuthAppDefinition()`/`getSchemaVaultsAuthApiDefinition()` factories (owner from the org getter, name/description from the friendly-name/description getters), the virtual system organization comes from `getHardcodedOrgs()` in `@schemavaults/auth-common`, and the configured ID is reserved (organization creation with it is blocked). Platform ownership is stored as a `NULL` `owner_organization_id` in the database, so changing the env var re-homes platform-owned rows automatically — but the ID must not collide with an existing organization row. Client components read the value from the `useAuthUiOwnerOrganizationId()` context (`AuthUiOwnerOrganizationProvider`, mounted in the root layout; defaults to `schemavaults` in external resource servers).

The auth server's *own app id* is env-var driven too: `SCHEMAVAULTS_AUTH_SERVER_APP_ID` (app ID, default `schemavaults-auth`, throws if set but invalid), resolved at call time by `getAuthServerAppId()` in `@schemavaults/app-definitions` (server-side import surface: `auth-server/src/lib/config/auth-server-app-id.ts`; the default is exported as `DEFAULT_AUTH_SERVER_APP_ID`, and the former `SCHEMAVAULTS_AUTH_APP_ID` constant export no longer exists). The id doubles as the auth server's own `api_server_id`, the JWT audience translation key, and the refresh-token cookie name suffix (`refresh_token_<id>` — renaming it logs every user out), and the hardcoded registries expose it via the call-time builders `getHardcodedAppIds()`/`getHardcodedApiServerIds()` (the module-scope `HARDCODED_*` const arrays were removed so the env var is never frozen at build time). Server-side code calls `getAuthServerAppId()` directly; client code must never call it (browser bundles silently get the default) — the `(client)/layout.tsx` server layout resolves it and threads it as a prop into `ClientAuthProvider`, which passes `app_id` + `auth_server_app_id` to the `AuthProvider` from `@schemavaults/auth-react-provider`; client components read it via `useAuthServerAppId()` (`AuthServerAppIdProvider` context, default `schemavaults-auth` in external resource servers) and `useIsAuthServer()` compares the two context values. The SDK layers accept an optional `auth_server_app_id` (`SchemaVaultsAuthClient` constructor option and `ReactAuthClientSdkAdapter` init option) so `isClientForAuthServer`-style checks work in white-label deployments. On the auth server deployment, `SCHEMAVAULTS_API_SERVER_ID` must be set to the same value (it is not auto-derived because external resource servers reuse that variable with their own IDs).

The auth server's *URL* (`SCHEMAVAULTS_AUTH_SERVER_URL`, resolved at call time by `getAuthServerUrl()` in `@schemavaults/app-definitions`, per-environment default e.g. `https://auth.schemavaults.com` in production) follows the same server-resolves/client-receives pattern: browser bundles can't read the env var and silently get the default, so client code must never call `getAuthServerUrl()`. The `(client)/layout.tsx` server layout resolves it and threads it as the `auth_server_url` prop through `ClientOnlyGlobalProviders` → `ClientAuthProvider` → `AuthProvider` (which otherwise falls back to `getAuthServerUrl()` — correct only for apps targeting the default deployment), so the client SDK sends every auth API request (register, login, token exchange, whoami, …) to the configured white-label origin; brand links read it via `useAuthServerUrl()` (`AuthServerUrlProvider`, mounted in the root layout). The audience-bearing zod schema factories in `@schemavaults/auth-common` (`createAudienceSchema`/`createAudienceListSchema`, the token-endpoint POST body schemas, and `createRequestTokensResultSchema`) accept an optional `AudienceSchemaOverrides` third argument (`{ auth_server_url, auth_server_app_id }`); `@schemavaults/auth-client-sdk` passes the client's configured values everywhere it validates audiences in the browser, since the env-derived defaults would reject white-label audiences. Cookie `Domain` attributes derive from `getHostname()` (`auth-server/src/lib/hostname.ts`), which strips any port from the `Host` header — a `Domain` with a port makes browsers silently drop the auth cookies.

## Multi-Factor Authentication

TOTP-based MFA lives in `auth-server/src/lib/mfa/` (KEK, recovery-code HMAC, TOTP via `otplib`, QR rendering, Redis challenge store) plus the `MfaRegistry` resource group at `auth-server/src/lib/auth-db/mfa/`. The login handler intercepts users with a verified factor and returns an `mfa_required` discriminated-union variant instead of an authorization code; the client completes the flow at `POST /api/auth/mfa/verify`. Required env vars: `PRIVATE_MFA_SECRET_KEK`, `PRIVATE_MFA_RECOVERY_PEPPER` (both 32-byte base64).

The account-management UI lives in the auth-server `src/components/` (it is consumed only by the auth-server, not by external resource servers) and renders on the dedicated `/mfa` route: `src/components/Mfa/` owns `TotpSettingsCard` plus the TOTP dialogs (`TotpEnrollmentDialog`, `MfaRemoveFactorDialog`, `MfaRegenerateRecoveryCodesDialog`), `src/components/RecoveryCodesPanel/` owns `RecoveryCodesPanel`, and `src/components/Passkeys/` owns `PasskeysSettingsCard`/`PasskeysSettingsSection` (the WebAuthn browser ceremonies). `@schemavaults/auth-ui` retains the login challenge-flow components (`MfaChallengeForm`, `MfaFactorPicker`) used at `/auth/mfa`. The React state hook is `useMfa()` in `@schemavaults/auth-react-provider`.

## OIDC Subject Claim Format

The OIDC-facing `sub` claim is namespaced by the deployment's own app id, Auth0-style: `<auth_server_app_id>|<uid>` (e.g. `schemavaults-auth|4f7c…`), built/parsed by `formatOidcSubClaim`/`parseOidcSubClaim` in `@schemavaults/auth-common` (`src/oidc/sub-claim.ts`; the `|` delimiter can never appear in an app id). It applies on exactly three surfaces, which OIDC Core §5.3.2 requires to agree: the id_token (`generateIdToken` in `@schemavaults/jwt`, prefix from the optional `auth_server_app_id` option defaulting to `getAuthServerAppId()`), `GET/POST /api/oidc/userinfo`, and RFC 7662 introspection. The platform's own encrypted access/refresh token payloads are NOT OIDC and keep the `sub === uid` invariant (`payload_data.ts`) that resource-server SDKs and `UserData.sub` rely on. Because `SCHEMAVAULTS_AUTH_SERVER_APP_ID` is stable per deployment, subjects are stable per user; changing that env var (or the introduction of this prefix itself) changes every OIDC subject, so RPs keying storage on `sub` see new identities.

## OIDC Confidential Clients & Explicit Callback URLs

Client apps are public clients (PKCE-only) by default; registering a *client secret* makes an app a confidential client. Secrets are stored as SHA-256 digests in the `APP_CLIENT_SECRETS` table (one per app; plaintext shown once at generation/rotation, never persisted — generation/hashing/verification in `auth-server/src/lib/oauth2/client-secret.ts`). When an app has a secret, **every** token surface requires client authentication: `/api/oidc/token` (via `client_secret_basic` Basic header or `client_secret_post` form field; failures return RFC 6749 §5.2 `invalid_client` 401s with `WWW-Authenticate`) and the legacy `/api/auth/token/{authorization_code,refresh_token}/[client_app_id]` JSON endpoints (optional `client_secret` body field or Basic header) — both surfaces redeem the same codes, so enforcement is shared via `authenticateTokenEndpointClient` in `auth-server/src/lib/oauth2/authenticate-token-endpoint-client.ts`. The discovery document advertises `token_endpoint_auth_methods_supported: ["none", "client_secret_basic", "client_secret_post"]`; PKCE S256 stays mandatory for all clients. Management API: `GET`/`POST`/`PUT`/`DELETE /api/apps/[app_id]/client-secret` (metadata / generate / rotate / remove; org owners/admins or global admins, guarded by `loadAppForManagement`; hardcoded apps excluded).

*Explicit callback URLs* (`APP_CALLBACK_URLS` table, `schemaVaultsAppCallbackUrlRefSchema` in `@schemavaults/app-definitions`) optionally restrict OAuth2/OIDC `redirect_uri` values per app + environment: while none are registered, any path on a registered app domain is accepted (legacy origin matching); once one or more exist for an environment, `redirect_uri` must exactly match a registered URL (RFC 6749 §3.1.2.3 simple string comparison via `isRedirectUriInCallbackAllowlist` in `@schemavaults/auth-common`, URL-normalized, fragments forbidden). The switch lives in `isRedirectUriRegisteredForClientApp` (`auth-server/src/lib/oauth2/validate-redirect-uri.ts`), which every code-issuance path and page-render guard funnels through. Management API: `GET`/`POST /api/apps/[app_id]/callback-urls`, `DELETE /api/apps/[app_id]/callback-urls/[ref_id]`. Both features surface on the app detail page via `AppClientSecretCard`/`AppCallbackUrlsCard` (`auth-server/src/components/AppOAuthSecurity/`), the client SDK exposes `listClientApplicationCallbackUrls`/`createClientApplicationCallbackUrl`/`deleteClientApplicationCallbackUrl` and `getClientApplicationSecretMetadata`/`generateClientApplicationSecret`/`rotateClientApplicationSecret`/`deleteClientApplicationSecret`, and the E2E seed route `create-test-nextjs-app` accepts optional `client_secret`/`callback_urls` fields.

## Continuous Integration & Continuous Delivery (C.I. & C.D. )
The `.github/workflows` directory contains GitHub Actions workflows for automatically testing & publishing the `@schemavaults/auth` application/package suite.

## Docker Deployment

`auth-server/Dockerfile` has four runtime targets: `staging` (self-contained standalone server including `.next/static/` and `public/`), `production` (slim image WITHOUT `.next/static/`, for deployments where nginx serves the static assets; `public/` is retained because the server fs-reads `public/branding-defaults/` and the `/_next/image` optimizer resolves public assets like `/icon.png` from disk), `nginx` (static-asset tier: nginx with `.next/static/` + `public/` baked in, site config rendered from `deploy/nginx/templates/auth-server.conf.template` via the stock nginx image's envsubst entrypoint, parameterized by `SERVER_NAME`/`AUTH_SERVER_UPSTREAM`/`STATIC_ROOT`/`CLIENT_MAX_BODY_SIZE`), and `test` (like `staging` but with the `/api/test` routes retained; used by the E2E suite). The `deploy/` directory contains a single-VM docker compose stack (nginx + `production` auth-server + Postgres + Redis; the nginx tier sits behind the `nginx` compose profile — default-on via `COMPOSE_PROFILES=nginx` in `deploy/.env` — so host-level-nginx deployments can start just postgres/redis/auth-server; the stack sets `SCHEMAVAULTS_DBH_ADAPTER=postgres` so the server connects to the bundled Postgres directly over TCP, and migrations use the standard `dbh migrate` CLI, which honors `SCHEMAVAULTS_DBH_ADAPTER` / `--adapter` since dbh 0.12.0) and `deploy/nginx/generate-nginx-site-config.sh`, a dependency-free generator that renders the same template for host-level nginx (sites-available) deployments — see `deploy/README.md`. All Docker builds use the monorepo root as build context; the root `.dockerignore` keeps `node_modules/`, build caches, and env files out of every build context.

## E2E Testing

The `tests/e2e-auth-tests` directory contains Cypress E2E test suite for testing the auth server.
- `tests/e2e-auth-tests/cypress/support/e2e.ts`, `tests/e2e-auth-tests/cypress/support/commands.ts`, and `tests/e2e-auth-tests/cypress/support/actions/` contain reusable commands (e.g. `cy.login()`, `cy.register()`, etc.) for making writing tests easier.

The actual E2E tests live within the `tests/e2e-auth-tests/cypress/e2e/` directory.

Specs and helper commands never hardcode the auth server's own app id: they resolve it with `getAuthServerAppIdFromCypressEnv()` from `@schemavaults/cypress-e2e-auth-tests-helper-commands`, which reads the `SCHEMAVAULTS_AUTH_SERVER_APP_ID` Cypress env var (defaulted in `cypress.config.ts` from the same-named process env var, overridable via `CYPRESS_SCHEMAVAULTS_AUTH_SERVER_APP_ID`; falls back to `schemavaults-auth`). Set it to the deployment's `SCHEMAVAULTS_AUTH_SERVER_APP_ID` to run the suite against a white-label auth server with a custom app id. Node-context config code (`setupNodeEvents`, e.g. `pre-register-superuser.ts`) receives the value via `config.env` instead, since the `Cypress` global doesn't exist there.

## NextJS Documentation

Your training data is likely outdated; documentation on the current version of NextJS is available at: `./auth-server/node_modules/next/dist/docs/`.
